"""
Generates the body map images and the 15 anatomical regions per view (front/back) for the
male (M) and female (F) characters.

Input:    tools/imagens_originais/ (one front/back pair per character, see MODELOS)
Output:   frontend/src/assets/body/astronauta_{masculino,feminino}_{frente,costas}.png
          frontend/src/components/corpoRegioes.ts  (MAPA_CORPO[genero][vista].regioes -> id, nome, d, anchor)

Steps:
1. Background: uses the PNG transparency (or removes a light background, if the image has one).
2. Logo cleanup: removes the NASA logo and US flags at the positions in the LOGOS table
   (cv2.inpaint with the surrounding fabric) and applies the Brazil flag patch on the astronaut's chest.
3. Crop and scale.
4. Landmarks read from the silhouette (alpha channel) and the suit colors: chin, collar, armpits, black belt, cuffs
   (end of the orange sleeve), crotch and top of the boots.
5. Row-by-row labeling -> one mask per region -> morphological closing -> contour ->
   cv2.approxPolyDP (smooth polygon) -> <path>. Anchor = real centroid (moments) of the region.

Run (from the project root):  backend/venv/Scripts/python.exe tools/gerar_mapa_corpo.py
Requires: pillow, numpy, opencv-python-headless (installed in the backend venv).
"""
import os
from typing import Dict, List, Tuple

import cv2
import numpy as np
from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEM = os.path.join(RAIZ, "tools", "imagens_originais")
DESTINO_IMG = os.path.join(RAIZ, "frontend", "src", "assets", "body")
DESTINO_TS = os.path.join(RAIZ, "frontend", "src", "components", "corpoRegioes.ts")

ALTURA_FINAL = 640  # only shrinks larger images; never enlarges
COR_SENTINELA = (255, 0, 255)

# gender -> (front file, back file, character name in the assets)
MODELOS = {
    "M": ("astronauta_frente_sem_fundo.png", "astronauta_costas_sem_fundo.png", "masculino"),
    "F": ("astronauta_feminina_frente_sem_fundo.png", "astronauta_feminina_costas_sem_fundo.png", "feminino"),
}

NOMES = {
    "frente": {
        "cabeca": "Head", "pescoco": "Neck",
        "ombro_dir": "Right Shoulder", "ombro_esq": "Left Shoulder",
        "torax": "Thorax / Chest", "abdomen": "Abdomen", "pelve": "Pelvis / Hip",
        "braco_dir": "Right Arm", "braco_esq": "Left Arm",
        "mao_dir": "Right Hand", "mao_esq": "Left Hand",
        "perna_dir": "Right Leg", "perna_esq": "Left Leg",
        "pe_dir": "Right Foot", "pe_esq": "Left Foot",
    },
    "costas": {
        "cabeca": "Head (back)", "nuca": "Nape",
        "ombro_dir": "Right Shoulder", "ombro_esq": "Left Shoulder",
        "costas_sup": "Back / Thoracic Spine", "lombar": "Lumbar Spine", "pelve": "Glutes / Pelvis",
        "braco_dir": "Right Arm", "braco_esq": "Left Arm",
        "mao_dir": "Right Hand", "mao_esq": "Left Hand",
        "perna_dir": "Right Leg", "perna_esq": "Left Leg",
        "pe_dir": "Right Foot", "pe_esq": "Left Foot",
    },
}


# ---------------------------------------------------------------------------
# 1. Background
# ---------------------------------------------------------------------------

def remover_fundo(caminho: str) -> Image.Image:
    original = Image.open(caminho)
    if original.mode in ("RGBA", "LA") or "transparency" in original.info:
        rgba = original.convert("RGBA")
        if (np.asarray(rgba)[:, :, 3] == 0).mean() > 0.05:
            return rgba
    rgb = original.convert("RGB")
    w, h = rgb.size
    marcado = rgb.copy()
    arr = np.asarray(rgb).astype(int)
    for y in list(range(0, h, 6)) + [h - 1]:
        for x in (0, w - 1):
            if marcado.getpixel((x, y)) != COR_SENTINELA and arr[y, x].min() >= 150:
                ImageDraw.floodfill(marcado, (x, y), COR_SENTINELA, thresh=48)
    for x in range(0, w, 6):
        for y in (0, h - 1):
            if marcado.getpixel((x, y)) != COR_SENTINELA and arr[y, x].min() >= 150:
                ImageDraw.floodfill(marcado, (x, y), COR_SENTINELA, thresh=48)
    fundo = np.all(np.asarray(marcado) == COR_SENTINELA, axis=2)
    a = arr.astype(np.uint8)
    alpha = np.where(fundo, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([a, alpha]), "RGBA")


def recortar(img: Image.Image) -> Image.Image:
    alpha = np.asarray(img)[:, :, 3]
    ys, xs = np.where(alpha > 200)
    margem = 16
    caixa = (max(0, xs.min() - margem), max(0, ys.min() - margem),
             min(img.width, xs.max() + margem), min(img.height, ys.max() + margem))
    img = img.crop(caixa)
    if img.height <= ALTURA_FINAL:
        return img
    escala = ALTURA_FINAL / img.height
    return img.resize((round(img.width * escala), ALTURA_FINAL), Image.LANCZOS)


# ---------------------------------------------------------------------------
# 2. Logo cleanup (NASA and US flag) and Brazil patch
# ---------------------------------------------------------------------------

# Positions (in pixels of the ORIGINAL images) of the items to clean. Collected once by visual inspection;
# if the source images change, update this table.
#   nasa: (cx, cy, radius) of the circular logo | eua: (x0, y0, x1, y1) of US flags
#   brasil_no_peito: box of the chest US flag that receives the Brazil patch
LOGOS = {
    "astronauta_frente_sem_fundo.png": {"nasa": [(317.5, 120.5, 10)], "eua": []},
    "astronauta_costas_sem_fundo.png": {"nasa": [(334.5, 98.0, 15)], "eua": [(282, 87, 296, 107)]},
    "astronauta_feminina_frente_sem_fundo.png": {
        "nasa": [(318.0, 122.0, 10.5)],
        "eua": [(340, 113, 362, 130), (377, 105, 387, 123)],
        "brasil_no_peito": (340, 113, 362, 130),
    },
    "astronauta_feminina_costas_sem_fundo.png": {"nasa": [(334.0, 101.0, 15.5)], "eua": [(284, 88, 298, 109)]},
}
# Brazil flag patch on the male character's chest (original front image)
CAIXA_PATCH_BRASIL = ("astronauta_frente_sem_fundo.png", (340, 113, 361, 127))


def extrair_patch_brasil() -> Image.Image:
    arquivo, caixa = CAIXA_PATCH_BRASIL
    return Image.open(os.path.join(ORIGEM, arquivo)).convert("RGBA").crop(caixa)


def limpar_logos(rgba: Image.Image, arquivo: str, patch_brasil: Image.Image) -> Image.Image:
    """Erases the NASA logo and US flags (inpaint with the surrounding fabric); applies the Brazil patch."""
    itens = LOGOS.get(arquivo)
    if not itens:
        return rgba
    a = np.asarray(rgba).copy()
    h, w = a.shape[:2]
    remover = np.zeros((h, w), np.uint8)
    for cx, cy, raio in itens.get("nasa", []):
        cv2.circle(remover, (int(round(cx)), int(round(cy))), int(round(raio)), 1, -1)
    for x0, y0, x1, y1 in itens.get("eua", []):
        remover[y0:y1, x0:x1] = 1
    remover &= (a[..., 3] > 200).astype(np.uint8)
    bgr = cv2.cvtColor(np.ascontiguousarray(a[..., :3]), cv2.COLOR_RGB2BGR)
    limpo = cv2.inpaint(bgr, remover * 255, 5, cv2.INPAINT_TELEA)
    a[..., :3] = cv2.cvtColor(limpo, cv2.COLOR_BGR2RGB)
    saida = Image.fromarray(a, "RGBA")
    caixa = itens.get("brasil_no_peito")
    if caixa:
        x0, y0, x1, y1 = caixa
        alvo_w = x1 - x0 - 2
        patch = patch_brasil.resize((alvo_w, round(patch_brasil.height * alvo_w / patch_brasil.width)), Image.LANCZOS)
        saida.alpha_composite(patch, ((x0 + x1) // 2 - patch.width // 2, (y0 + y1) // 2 - patch.height // 2))
    return saida


# ---------------------------------------------------------------------------
# 3. Anatomical segmentation
# ---------------------------------------------------------------------------

def trechos(linha: np.ndarray, minimo: int = 2) -> List[Tuple[int, int]]:
    resultado, inicio = [], None
    for x, v in enumerate(linha):
        if v and inicio is None:
            inicio = x
        elif not v and inicio is not None:
            if x - inicio >= minimo:
                resultado.append((inicio, x - 1))
            inicio = None
    if inicio is not None and len(linha) - inicio >= minimo:
        resultado.append((inicio, len(linha) - 1))
    return resultado


def segmentar(img: Image.Image, vista: str) -> Tuple[Dict[str, dict], dict]:
    a = np.asarray(img).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fig = cv2.morphologyEx((a[..., 3] > 128).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
    laranja = (r > 140) & (r > g + 45) & (r > b + 80)
    escuro = np.maximum(np.maximum(r, g), b) < 80
    h, w = fig.shape
    linhas = {y: trechos(fig[y]) for y in range(h)}
    validas = [y for y in range(h) if linhas[y]]
    topo, base = validas[0], validas[-1]
    alt = base - topo

    def largura(y):
        t = linhas[y]
        return (t[-1][1] - t[0][0] + 1) if t else 0

    # Neck (narrowest row between head and shoulders), chin and suit collar
    pescoco_min = min(range(topo + int(alt * 0.08), topo + int(alt * 0.22)), key=largura)
    larg_pesc = largura(pescoco_min)
    # Chin by anatomical proportion (head ≈ 1/9 of the height): width is misleading when hair is tied up/loose
    queixo = topo + int(round(alt * 0.11))
    gola = next((y for y in range(pescoco_min, base) if largura(y) >= larg_pesc * 1.45), pescoco_min + 6)
    gola = min(max(gola, queixo + int(alt * 0.02)), queixo + int(alt * 0.06))

    # Armpit and hands (arms separated from the torso), torso limits
    axila = next(y for y in range(gola + 5, base) if len(linhas[y]) >= 3)
    fim_maos = max(y for y in range(axila, topo + int(alt * 0.75)) if len(linhas[y]) >= 3)
    meio = linhas[axila][len(linhas[axila]) // 2]
    tronco_esq, tronco_dir = meio
    centro = (tronco_esq + tronco_dir) / 2
    larg_tronco = tronco_dir - tronco_esq

    # Black belt: band of dark rows across the torso width, between armpit and hip
    xs0, xs1 = int(tronco_esq + larg_tronco * 0.12), int(tronco_dir - larg_tronco * 0.12)
    faixa_escura = [y for y in range(axila, topo + int(alt * 0.65)) if escuro[y, xs0:xs1].mean() > 0.5]
    if faixa_escura:
        # largest continuous block of dark rows
        blocos, atual = [], [faixa_escura[0]]
        for y in faixa_escura[1:]:
            if y == atual[-1] + 1:
                atual.append(y)
            else:
                blocos.append(atual)
                atual = [y]
        blocos.append(atual)
        cinto = max(blocos, key=len)
        cinto_topo, cinto_base = cinto[0], cinto[-1]
    else:
        cinto_topo = topo + int(alt * 0.45)
        cinto_base = cinto_topo + int(alt * 0.03)
    meio_peito = gola + int((cinto_topo - gola) * 0.55)
    abaixo_cinto = cinto_base + 2

    # Crotch: legs split apart (discards the hand stretches beside the thighs)
    def trechos_corpo(y):
        return [t for t in linhas[y] if tronco_esq - 6 <= (t[0] + t[1]) / 2 <= tronco_dir + 6]

    virilha = next(y for y in range(abaixo_cinto + 3, base) if len(trechos_corpo(y)) >= 2)
    dv = max(4, int(alt * 0.05))  # depth of the "V" of the crotch creases

    # Top of the boots: first row (below the crotch) where the legs stop being orange
    inicio_busca = virilha + int((base - virilha) * 0.4)
    bota = next(
        (y for y in range(inicio_busca, base)
         if all(laranja[y, t[0]: t[1] + 1].mean() < 0.3 for t in trechos_corpo(y)) and trechos_corpo(y)),
        base - int(alt * 0.12),
    )

    # Cuffs: end of the orange sleeve on each arm (hand and cuff are not orange)
    def punho(lado: str) -> int:
        for y in range(axila + int((fim_maos - axila) * 0.4), fim_maos):
            t = linhas[y]
            if len(t) < 3:
                continue
            run = t[0] if lado == "esq" else t[-1]
            if laranja[y, run[0]: run[1] + 1].mean() < 0.35:
                return y
        return fim_maos - int(alt * 0.08)

    punho_esq_tela, punho_dir_tela = punho("esq"), punho("dir")

    # Anatomical side of each screen side: in the front view the left of the screen is the astronaut's RIGHT side
    lado_tela_esq = "dir" if vista == "frente" else "esq"
    lado_tela_dir = "esq" if vista == "frente" else "dir"
    reg_pescoco = "pescoco" if vista == "frente" else "nuca"
    reg_alto = "torax" if vista == "frente" else "costas_sup"
    reg_meio = "abdomen" if vista == "frente" else "lombar"

    rotulo = np.full((h, w), "", dtype=object)
    for y in validas:
        for x0, x1 in linhas[y]:
            for x in range(x0, x1 + 1):
                tela_esq = x < centro
                lado = lado_tela_esq if tela_esq else lado_tela_dir
                if y <= queixo:
                    nome = "cabeca"
                elif y < gola:
                    nome = reg_pescoco
                elif y < axila:
                    # above the armpit: outside the torso limits is shoulder
                    nome = f"ombro_{lado}" if (x < tronco_esq or x > tronco_dir) else reg_alto if y < meio_peito else reg_meio
                else:
                    no_braco = not (tronco_esq - 6 <= (x0 + x1) / 2 <= tronco_dir + 6) and len(linhas[y]) >= 3
                    if no_braco:
                        p = punho_esq_tela if tela_esq else punho_dir_tela
                        nome = f"mao_{lado}" if y >= p else f"braco_{lado}"
                    elif y < meio_peito:
                        nome = reg_alto
                    elif y < abaixo_cinto:
                        nome = reg_meio
                    else:
                        # diagonal creases: the pelvis "V" goes down to the crotch at the center
                        dist = min(1.0, abs(x - centro) / max(1.0, larg_tronco / 2))
                        limite = virilha - dv * dist
                        if y < limite:
                            nome = "pelve"
                        elif y < bota:
                            nome = f"perna_{lado}"
                        else:
                            nome = f"pe_{lado}"
                rotulo[y, x] = nome

    regioes: Dict[str, dict] = {}
    for rid, nome_pt in NOMES[vista].items():
        mascara = (rotulo == rid).astype(np.uint8)
        if mascara.sum() < 5:
            print(f"   ! empty region: {rid}")
            continue
        mascara = cv2.morphologyEx(mascara, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        contornos, _ = cv2.findContours(mascara, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        contornos = [c for c in contornos if cv2.contourArea(c) >= 6]
        if not contornos:
            continue
        maior = max(contornos, key=cv2.contourArea)
        momentos = cv2.moments(maior)
        ax, ay = momentos["m10"] / momentos["m00"], momentos["m01"] / momentos["m00"]
        caminhos = []
        for c in sorted(contornos, key=cv2.contourArea, reverse=True)[:2]:
            aprox = cv2.approxPolyDP(c, 0.9, True).reshape(-1, 2)
            if len(aprox) < 3:
                continue
            pts = " ".join(f"L{x + 0.5:.1f},{y + 0.5:.1f}" for x, y in aprox[1:])
            caminhos.append(f"M{aprox[0][0] + 0.5:.1f},{aprox[0][1] + 0.5:.1f} {pts} Z")
        regioes[rid] = {"id": rid, "nome": nome_pt, "d": " ".join(caminhos), "anchor": {"x": round(ax, 1), "y": round(ay, 1)}}

    marcos = {"topo": topo, "queixo": queixo, "gola": gola, "axila": axila, "meio_peito": meio_peito,
              "cinto": (cinto_topo, cinto_base), "virilha": virilha, "bota": bota,
              "punhos": (punho_esq_tela, punho_dir_tela), "base": base}
    return regioes, marcos


# ---------------------------------------------------------------------------
# 4. Generation
# ---------------------------------------------------------------------------

def main():
    os.makedirs(DESTINO_IMG, exist_ok=True)
    patch_brasil = extrair_patch_brasil()
    mapa: Dict[str, Dict[str, dict]] = {}
    for genero, (arq_frente, arq_costas, personagem) in MODELOS.items():
        mapa[genero] = {}
        for vista, arquivo in (("frente", arq_frente), ("costas", arq_costas)):
            rgba = remover_fundo(os.path.join(ORIGEM, arquivo))
            rgba = limpar_logos(rgba, arquivo, patch_brasil)
            img = recortar(rgba)
            img.save(os.path.join(DESTINO_IMG, f"astronauta_{personagem}_{vista}.png"), optimize=True)
            regioes, marcos = segmentar(img, vista)
            print(f" {genero} {vista}: {img.width}x{img.height} | {len(regioes)} regions | {marcos}")
            mapa[genero][vista] = {"largura": img.width, "altura": img.height, "regioes": regioes}

    linhas = [
        "// File GENERATED by tools/gerar_mapa_corpo.py. Do not edit by hand.",
        "// 15 anatomical regions per view, for the male (M) and female (F) characters.",
        "// d = <path> outline; anchor = real centroid of the region (for lines, markers and reticles).",
        "",
        'export type Genero = "M" | "F";',
        'export type Vista = "frente" | "costas";',
        "",
        "export interface RegiaoCorpo {",
        "  id: string;",
        "  nome: string;",
        "  d: string;",
        "  anchor: { x: number; y: number };",
        "}",
        "",
        "export interface VistaCorpo {",
        "  largura: number;",
        "  altura: number;",
        "  regioes: RegiaoCorpo[];",
        "}",
        "",
        "export const MAPA_CORPO: Record<Genero, Record<Vista, VistaCorpo>> = {",
    ]
    for genero, vistas in mapa.items():
        linhas.append(f"  {genero}: {{")
        for vista, dados in vistas.items():
            linhas.append(f"    {vista}: {{")
            linhas.append(f"      largura: {dados['largura']},")
            linhas.append(f"      altura: {dados['altura']},")
            linhas.append("      regioes: [")
            for reg in dados["regioes"].values():
                linhas.append(
                    f'        {{ id: "{reg["id"]}", nome: "{reg["nome"]}", '
                    f'anchor: {{ x: {reg["anchor"]["x"]}, y: {reg["anchor"]["y"]} }}, d: "{reg["d"]}" }},'
                )
            linhas.append("      ],")
            linhas.append("    },")
        linhas.append("  },")
    linhas.append("};")
    linhas.append("")
    with open(DESTINO_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(linhas))
    print("ok:", DESTINO_TS)


if __name__ == "__main__":
    main()
