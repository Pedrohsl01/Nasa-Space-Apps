"""
Gera as imagens do mapa corporal e os contornos (<path>) de cada região.

Entrada:  tools/imagens_originais/astronauta_frente_sem_fundo.png e astronauta_costas_sem_fundo.png
          (PNG já sem fundo; se vier com fundo claro, o script remove)
Saída:    frontend/src/assets/body/astronauta_{frente,costas}.png  (recortadas, fundo transparente)
          frontend/src/components/corpoRegioes.ts                  (viewBox + paths por região)

Como funciona:
1. Remove o fundo claro por preenchimento a partir das bordas (flood fill), mantendo uma sombra suave.
2. Recorta o personagem e padroniza a altura.
3. Lê a silhueta linha a linha (trechos opacos por linha) para achar pescoço, axilas, fim das mãos
   e virilha, e a partir disso monta o contorno de cabeça, braços, pernas, tronco, pulmões, coração
   e coluna. Os contornos seguem a silhueta real do personagem, não são formas geométricas soltas.

Rodar (da raiz do projeto):  backend/venv/Scripts/python.exe tools/gerar_mapa_corpo.py
"""
import os
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEM = os.path.join(RAIZ, "tools", "imagens_originais")
DESTINO_IMG = os.path.join(RAIZ, "frontend", "src", "assets", "body")
DESTINO_TS = os.path.join(RAIZ, "frontend", "src", "components", "corpoRegioes.ts")

ALTURA_FINAL = 640  # px da figura recortada (as duas vistas ficam com a mesma escala)
COR_SENTINELA = (255, 0, 255)


def remover_fundo(caminho: str) -> Image.Image:
    original = Image.open(caminho)
    # Imagem que já vem sem fundo (PNG com transparência): usa a transparência dela como está
    if original.mode in ("RGBA", "LA") or "transparency" in original.info:
        rgba = original.convert("RGBA")
        if (np.asarray(rgba)[:, :, 3] == 0).mean() > 0.05:
            return rgba
    rgb = original.convert("RGB")
    w, h = rgb.size
    marcado = rgb.copy()
    arr = np.asarray(rgb).astype(int)

    def claro_neutro(x, y):
        r, g, b = arr[y, x]
        return min(r, g, b) >= 150 and max(r, g, b) - min(r, g, b) <= 14

    def preencher(x, y):
        if marcado.getpixel((x, y)) != COR_SENTINELA and claro_neutro(x, y):
            # thresh moderado: um valor alto "vaza" para dentro das botas brancas
            ImageDraw.floodfill(marcado, (x, y), COR_SENTINELA, thresh=48)

    # Sementes em toda a borda: o fundo é claro e uniforme
    for x in range(0, w, 6):
        for y in (0, h - 1):
            preencher(x, y)
    for y in range(0, h, 6):
        for x in (0, w - 1):
            preencher(x, y)
    # Vão entre as pernas: fica "fechado" pela figura, então recebe sementes pela coluna central.
    # Uma barreira temporária na altura das canelas impede o preenchimento de descer até as botas
    # brancas (que têm quase a mesma cor do fundo).
    mascara_previa = ~np.all(np.asarray(marcado) == COR_SENTINELA, axis=2)
    ys_prev = np.where(mascara_previa.any(axis=1))[0]
    y_barreira = int(ys_prev.min() + (ys_prev.max() - ys_prev.min()) * 0.80)
    guarda = [marcado.getpixel((x, y_barreira)) for x in range(w)]
    ImageDraw.Draw(marcado).line([(0, y_barreira), (w - 1, y_barreira)], fill=(0, 0, 0), width=1)
    for y in range(int(h * 0.5), y_barreira - 2, 4):
        for x in range(int(w * 0.46), int(w * 0.54), 3):
            preencher(x, y)
    for x, cor in enumerate(guarda):
        marcado.putpixel((x, y_barreira), cor)

    # Entre e abaixo das botas: preenchimento bem restrito (só pixels quase idênticos ao fundo)
    fundo_ref = np.median(arr[0:5, :, :].reshape(-1, 3), axis=0)
    for y in range(y_barreira + 2, h, 3):
        for x in range(int(w * 0.40), int(w * 0.60), 3):
            if marcado.getpixel((x, y)) == COR_SENTINELA:
                continue
            if np.abs(arr[y, x] - fundo_ref).max() <= 5:
                ImageDraw.floodfill(marcado, (x, y), COR_SENTINELA, thresh=10)

    a = np.asarray(rgb).astype(np.float32)
    fundo = np.all(np.asarray(marcado) == COR_SENTINELA, axis=2)
    lum = a.mean(axis=2)
    lum_fundo = float(np.median(lum[fundo]))

    # Sombra do chão: cinza neutro na faixa dos pés, mas FORA da largura das pernas/botas
    satur = a.max(axis=2) - a.min(axis=2)
    neutro_claro = (a.min(axis=2) >= 120) & (satur <= 18)
    ys_fig, _ = np.where(~fundo)
    base_fig = int(ys_fig.max())
    topo_fig = int(ys_fig.min())
    y_ref = topo_fig + int((base_fig - topo_fig) * 0.80)  # altura das canelas, acima da sombra
    xs_pernas = np.where(~fundo[y_ref])[0]
    if xs_pernas.size:
        folga = int((xs_pernas.max() - xs_pernas.min()) * 0.10)
        x_min, x_max = xs_pernas.min() - folga, xs_pernas.max() + folga
        faixa = np.zeros_like(fundo)
        faixa[y_ref:, :] = True
        colunas = np.arange(fundo.shape[1])
        fora = (colunas < x_min) | (colunas > x_max)
        faixa[:, ~fora] = False
        fundo = fundo | (faixa & neutro_claro)

    # Franja clara nas bordas (antisserrilhado contra o fundo branco): erode 2 px de pixels claros e neutros
    claro_borda = (a.min(axis=2) >= 200) & (satur <= 16)
    for _ in range(2):
        vizinho_fundo = np.zeros_like(fundo)
        vizinho_fundo[1:, :] |= fundo[:-1, :]
        vizinho_fundo[:-1, :] |= fundo[1:, :]
        vizinho_fundo[:, 1:] |= fundo[:, :-1]
        vizinho_fundo[:, :-1] |= fundo[:, 1:]
        fundo = fundo | (vizinho_fundo & claro_borda & ~fundo)

    # Fundo vira transparente; a sombra do chão vira uma sombra escura translúcida
    alpha = np.full(lum.shape, 255.0)
    sombra = np.clip((lum_fundo - lum) * 5.0, 0, 110)
    alpha[fundo] = sombra[fundo]
    saida = a.copy()
    saida[fundo] = 0
    rgba = np.dstack([saida, alpha]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def recortar(img: Image.Image) -> Image.Image:
    alpha = np.asarray(img)[:, :, 3]
    # Recorte pela figura (opaca), não pela sombra, para não sobrar espaço vazio dos lados
    ys, xs = np.where(alpha > 200)
    margem = 16
    caixa = (max(0, xs.min() - margem), max(0, ys.min() - margem),
             min(img.width, xs.max() + margem), min(img.height, ys.max() + margem))
    img = img.crop(caixa)
    # Só reduz, nunca amplia (ampliar deixaria a imagem borrada)
    if img.height <= ALTURA_FINAL:
        return img
    escala = ALTURA_FINAL / img.height
    return img.resize((round(img.width * escala), ALTURA_FINAL), Image.LANCZOS)


def trechos(linha: np.ndarray, minimo: int = 3) -> List[Tuple[int, int]]:
    """Trechos contínuos de pixels da figura numa linha: [(x_inicio, x_fim), ...]."""
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


def caminho(pontos: List[Tuple[float, float]]) -> str:
    if len(pontos) < 3:
        return ""
    p0 = pontos[0]
    corpo = " ".join(f"L{x:.1f},{y:.1f}" for x, y in pontos[1:])
    return f"M{p0[0]:.1f},{p0[1]:.1f} {corpo} Z"


def contorno_por_linhas(faixas: List[Tuple[int, float, float]]) -> str:
    """faixas: [(y, x_esq, x_dir), ...] de cima para baixo -> polígono fechado (desce pela esquerda, sobe pela direita)."""
    if not faixas:
        return ""
    esquerda = [(xe, y) for y, xe, _ in faixas]
    direita = [(xd, y) for y, _, xd in reversed(faixas)]
    return caminho(esquerda + direita)


def analisar(img: Image.Image, vista: str) -> Dict[str, str]:
    fig = np.asarray(img)[:, :, 3] > 200
    h, w = fig.shape
    linhas = {y: trechos(fig[y]) for y in range(h)}
    validas = [y for y in range(h) if linhas[y]]
    topo, base = validas[0], validas[-1]
    altura = base - topo

    def largura(y):
        t = linhas[y]
        return (t[-1][1] - t[0][0]) if t else 0

    # Cabeça e pescoço: menor largura entre 8% e 22% da altura (logo acima dos ombros)
    faixa_pescoco = range(topo + int(altura * 0.08), topo + int(altura * 0.22))
    pescoco = min(faixa_pescoco, key=largura)

    # Axila: primeira linha abaixo do pescoço com 3+ trechos (braços separados do tronco)
    axila = next(y for y in range(pescoco + 10, base) if len(linhas[y]) >= 3)
    # Fim das mãos: última linha com 3+ trechos na metade de cima/média
    fim_maos = max(y for y in range(axila, topo + int(altura * 0.75)) if len(linhas[y]) >= 3)
    # Virilha: primeira linha em que as pernas se separam. Enquanto as mãos aparecem, os trechos das
    # pontas são os braços; então procura 4+ trechos (braço, perna, perna, braço) ou 2 trechos sem braços.
    def pernas_separadas(y):
        n = len(linhas[y])
        return n >= 4 or (y > fim_maos and n == 2)
    virilha = next(y for y in range(axila + 20, base) if pernas_separadas(y))

    # Limites do tronco na altura da axila (trecho do meio)
    t_ax = linhas[axila]
    meio = t_ax[len(t_ax) // 2]
    tronco_esq, tronco_dir = meio
    centro = (tronco_esq + tronco_dir) / 2
    larg_tronco = tronco_dir - tronco_esq

    passo = 3
    regioes: Dict[str, str] = {}

    # ---------------- Cabeça (topo até o pescoço) ----------------
    cab = []
    for y in range(topo, pescoco + 1, 2):
        t = linhas[y]
        if t:
            # pega o trecho que contém o centro (evita ruído lateral)
            alvo = min(t, key=lambda r: abs((r[0] + r[1]) / 2 - centro))
            cab.append((y, alvo[0], alvo[1]))
    regioes["cabeca"] = contorno_por_linhas(cab)

    # ---------------- Braços (ombro até a mão) ----------------
    braco_esq, braco_dir = [], []
    for y in range(pescoco + 4, fim_maos + 1, passo):
        t = linhas[y]
        if not t:
            continue
        if len(t) >= 3:
            braco_esq.append((y, t[0][0], t[0][1]))
            braco_dir.append((y, t[-1][0], t[-1][1]))
        else:
            # ombro: braço = parte do trecho fora dos limites do tronco
            e0, d0 = t[0][0], t[-1][1]
            if e0 < tronco_esq - 2:
                braco_esq.append((y, e0, tronco_esq))
            if d0 > tronco_dir + 2:
                braco_dir.append((y, tronco_dir, d0))
    regioes["pele"] = contorno_por_linhas(braco_esq) + " " + contorno_por_linhas(braco_dir)

    # ---------------- Pernas (virilha até os pés) ----------------
    perna_esq, perna_dir = [], []
    for y in range(virilha, base + 1, passo):
        # Só trechos cujo centro está dentro da largura do tronco (descarta as mãos ao lado das coxas)
        t = [r for r in linhas[y] if tronco_esq - 6 <= (r[0] + r[1]) / 2 <= tronco_dir + 6]
        if len(t) >= 2:
            perna_esq.append((y, t[0][0], t[0][1]))
            perna_dir.append((y, t[-1][0], t[-1][1]))
    regioes["pernas"] = contorno_por_linhas(perna_esq) + " " + contorno_por_linhas(perna_dir)

    # Bordas reais do tronco por linha (entre os braços)
    def bordas_tronco(y):
        t = linhas[y]
        if len(t) >= 3:
            m = t[len(t) // 2]
            return m[0], m[1]
        return max(t[0][0], tronco_esq), min(t[-1][1], tronco_dir)

    inicio_torax = pescoco + int((axila - pescoco) * 0.35)
    fim_torax = pescoco + int((virilha - pescoco) * 0.52)

    # ---------------- Pulmões: dois lobos dentro do tórax ----------------
    gap = larg_tronco * (0.07 if vista == "frente" else 0.09)
    lobo_esq, lobo_dir = [], []
    for y in range(inicio_torax, fim_torax + 1, passo):
        e, d = bordas_tronco(y)
        t = (y - inicio_torax) / max(1, fim_torax - inicio_torax)
        # topo arredondado (ápice do pulmão) e base levemente curva (diafragma)
        arred_topo = (1 - min(1.0, t / 0.3)) ** 2 * (centro - e) * 0.55
        arred_base = (max(0.0, (t - 0.85) / 0.15)) ** 2 * (centro - e) * 0.35
        inset = larg_tronco * 0.06
        lobo_esq.append((y, e + inset + arred_topo, centro - gap - arred_base * 0.6))
        lobo_dir.append((y, centro + gap + arred_base * 0.6, d - inset - arred_topo))
    regioes["pulmao"] = contorno_por_linhas(lobo_esq) + " " + contorno_por_linhas(lobo_dir)

    if vista == "frente":
        # ---------------- Coração: formato anatômico no lado esquerdo do personagem ----------------
        # Na vista frontal, o lado esquerdo do personagem fica à direita de quem olha
        cx = centro + larg_tronco * 0.08
        cy = inicio_torax + (fim_torax - inicio_torax) * 0.45
        s = larg_tronco * 0.16
        regioes["peito"] = (
            f"M{cx:.1f},{cy + s * 0.95:.1f} "
            f"C{cx - s * 0.2:.1f},{cy + s * 0.75:.1f} {cx - s * 0.95:.1f},{cy + s * 0.25:.1f} {cx - s * 0.9:.1f},{cy - s * 0.25:.1f} "
            f"C{cx - s * 0.85:.1f},{cy - s * 0.7:.1f} {cx - s * 0.3:.1f},{cy - s * 0.85:.1f} {cx - s * 0.05:.1f},{cy - s * 0.45:.1f} "
            f"C{cx + s * 0.05:.1f},{cy - s * 0.85:.1f} {cx + s * 0.75:.1f},{cy - s * 0.8:.1f} {cx + s * 0.85:.1f},{cy - s * 0.3:.1f} "
            f"C{cx + s * 0.95:.1f},{cy + s * 0.15:.1f} {cx + s * 0.35:.1f},{cy + s * 0.65:.1f} {cx:.1f},{cy + s * 0.95:.1f} Z"
        )
        # Tronco inteiro (fundo do tórax) também conta como "peito" ao clicar fora dos pulmões
    else:
        # ---------------- Coluna: faixa vertebral do pescoço à lombar, com leve afinamento ----------------
        col = []
        fim_coluna = pescoco + int((virilha - pescoco) * 0.9)
        for y in range(pescoco + 2, fim_coluna + 1, passo):
            e, d = bordas_tronco(y)
            c = (e + d) / 2
            t = (y - pescoco) / max(1, fim_coluna - pescoco)
            meia = larg_tronco * (0.045 + 0.015 * np.sin(np.pi * t))
            col.append((y, c - meia, c + meia))
        regioes["coluna"] = contorno_por_linhas(col)

    marcos = {"topo": topo, "pescoco": pescoco, "axila": axila, "fim_maos": fim_maos, "virilha": virilha, "base": base}
    print(f"  {vista}: {w}x{h} marcos {marcos}")
    return regioes


def main():
    os.makedirs(DESTINO_IMG, exist_ok=True)
    vistas = {}
    for vista, arquivo in (("frente", "astronauta_frente_sem_fundo.png"), ("costas", "astronauta_costas_sem_fundo.png")):
        img = recortar(remover_fundo(os.path.join(ORIGEM, arquivo)))
        img.save(os.path.join(DESTINO_IMG, f"astronauta_{vista}.png"), optimize=True)
        vistas[vista] = {"largura": img.width, "altura": img.height, "regioes": analisar(img, vista)}

    linhas = [
        "// Arquivo GERADO por tools/gerar_mapa_corpo.py — não editar à mão.",
        "// Contornos (<path>) de cada região do corpo, no sistema de coordenadas das imagens recortadas.",
        "",
        "export const VISTAS_CORPO = {",
    ]
    for vista, dados in vistas.items():
        linhas.append(f"  {vista}: {{")
        linhas.append(f"    largura: {dados['largura']},")
        linhas.append(f"    altura: {dados['altura']},")
        linhas.append("    regioes: {")
        for zona, d in dados["regioes"].items():
            linhas.append(f'      {zona}: "{d.strip()}",')
        linhas.append("    },")
        linhas.append("  },")
    linhas.append("} as const;")
    linhas.append("")
    with open(DESTINO_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(linhas))
    print("ok:", DESTINO_TS)


if __name__ == "__main__":
    main()
