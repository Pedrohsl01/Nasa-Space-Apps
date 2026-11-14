import { useEffect, useState } from "react";
import { BodyMap } from "./components/BodyMap";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Activity, AlertTriangle, CheckCircle2, Radio, ShieldAlert, Sparkles } from "lucide-react";

const API_URL = "http://localhost:8000/api";

interface Astronauta {
  id_astronauta: string;
  nome: string;
  sexo: string;
}

export function App() {
  const [idAstronauta, setIdAstronauta] = useState("AST-01");
  const [diaMissao, setDiaMissao] = useState(50);
  const [zonaSelecionada, setZonaSelecionada] = useState<string | null>("cabeca");
  const [astronautas, setAstronautas] = useState<Astronauta[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Tripulação vem do CSV via API (não fica fixa no código)
  useEffect(() => {
    fetch(`${API_URL}/astronautas`)
      .then((r) => r.json())
      .then(setAstronautas)
      .catch(() => setErro("Não foi possível conectar ao backend em localhost:8000. Ele está rodando?"));
  }, []);

  const carregarAnalise = async (ast: string, dia: number, forcarIa = false) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/analisar-ia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_astronauta: ast,
          dia_missao: dia,
          forcar_ia: forcarIa,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDados(json);
      setErro(null);
    } catch (err) {
      console.error("Erro ao conectar com o backend:", err);
      setErro("Não foi possível conectar ao backend em localhost:8000. Ele está rodando?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAnalise(idAstronauta, diaMissao);
  }, [idAstronauta, diaMissao]);

  const payload = dados?.payload_compacto;
  const triagem = payload?.triagem_python;
  const ia = dados?.orientacao_ia;

  const badgeSemaforo = () => {
    if (!triagem) return null;
    if (triagem.codigo_semaforo === 3)
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-bold">
          <ShieldAlert className="w-4 h-4" /> NÍVEL 3 — CRÍTICO
        </span>
      );
    if (triagem.codigo_semaforo === 2)
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold">
          <AlertTriangle className="w-4 h-4" /> NÍVEL 2 — ATENÇÃO
        </span>
      );
    return (
      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold">
        <CheckCircle2 className="w-4 h-4" /> NÍVEL 1 — NOMINAL
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Aviso obrigatório: protótipo e dados simulados */}
      <div className="bg-amber-900/60 text-amber-100 text-xs text-center px-4 py-2 border-b border-amber-700/50">
        Protótipo de hackathon (NASA Space Apps 2026) • DADOS SIMULADOS • Não é dispositivo médico e não substitui avaliação profissional.
      </div>

      <div className="p-6">
      {/* Cabeçalho & Controles de Simulação */}
      <header className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-widest">
            <Radio className="w-4 h-4" /> NASA HRP • Copiloto Clínico Autônomo
          </div>
          <h1 className="text-2xl font-bold mt-1">AstroHealth Monitor</h1>
        </div>

        {/* Atalhos rápidos para demonstração no Pitch */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setIdAstronauta("AST-01"); setDiaMissao(15); }}
            className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/50 text-xs text-emerald-300"
          >
            Cenário 1: Nominal (Dia 15)
          </button>
          <button
            onClick={() => { setIdAstronauta("AST-01"); setDiaMissao(50); }}
            className="px-3 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 border border-amber-700/50 text-xs text-amber-300"
          >
            Cenário 2: Isolamento/Sono (Dia 50)
          </button>
          <button
            onClick={() => { setIdAstronauta("AST-02"); setDiaMissao(167); }}
            className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 border border-red-700/50 text-xs text-red-300"
          >
            Cenário 3: SANS/Gravidade (Dia 167)
          </button>
          <button
            onClick={() => { setIdAstronauta("AST-01"); setDiaMissao(295); }}
            className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 border border-red-700/50 text-xs text-red-300"
          >
            Cenário 4: Infecção/Marte (Dia 295)
          </button>
        </div>
      </header>

      {erro && (
        <div className="max-w-7xl mx-auto mt-6 p-4 rounded-xl bg-red-950/60 border border-red-800 text-sm text-red-200">
          {erro}
        </div>
      )}

      {/* Barra de Seleção de Tripulante e Dia */}
      <section className="max-w-7xl mx-auto my-6 bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={idAstronauta}
            onChange={(e) => setIdAstronauta(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            {astronautas.map((a) => (
              <option key={a.id_astronauta} value={a.id_astronauta}>
                {a.id_astronauta} • {a.nome} ({a.sexo})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Dia da Missão:</span>
            <input
              type="range"
              min={1}
              max={365}
              value={diaMissao}
              onChange={(e) => setDiaMissao(Number(e.target.value))}
              className="w-40 accent-sky-500"
            />
            <span className="font-mono font-bold text-sky-400 w-12">#{diaMissao}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {payload && (
            <span className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              Ambiente: <strong>{payload.contexto_missao.ambiente}</strong>
            </span>
          )}
          {badgeSemaforo()}
        </div>
      </section>

      {/* Grid Principal: Corpo Humano | Gráficos | Copiloto IA */}
      {payload && (
        <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna 1: Gêmeo Biométrico (4 colunas) */}
          <div className="lg:col-span-4">
            <BodyMap
              partesAfetadas={triagem.partes_afetadas}
              codigoSemaforo={triagem.codigo_semaforo}
              zonaSelecionada={zonaSelecionada}
              onSelectZona={setZonaSelecionada}
            />
          </div>

          {/* Coluna 2: Telemetria & Tendência de 14 dias (4 colunas) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" /> Telemetria vs. Linha de Base
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-800/70 p-3 rounded-xl">
                  <span className="text-slate-400 block">Pressão Arterial</span>
                  <strong className="text-sm text-white">{payload.telemetria_nominal_resumida.pa_atual}</strong>
                </div>
                <div className="bg-slate-800/70 p-3 rounded-xl">
                  <span className="text-slate-400 block">FC Repouso</span>
                  <strong className="text-sm text-white">{payload.telemetria_nominal_resumida.fc_repouso}</strong>
                </div>
                <div className="bg-slate-800/70 p-3 rounded-xl">
                  <span className="text-slate-400 block">Sono (Média 7d)</span>
                  <strong className="text-sm text-white">{dados.medias_7_dias.sono_horas} h</strong>
                </div>
                <div className="bg-slate-800/70 p-3 rounded-xl">
                  <span className="text-slate-400 block">Treino Resistido (7d)</span>
                  <strong className="text-sm text-white">{dados.medias_7_dias.treino_resistido_min} min</strong>
                </div>
                <div className="bg-slate-800/70 p-3 rounded-xl">
                  <span className="text-slate-400 block">Temperatura</span>
                  <strong className="text-sm text-white">{payload.telemetria_nominal_resumida.temperatura_c} °C</strong>
                </div>
                <div className="bg-slate-800/70 p-3 rounded-xl">
                  <span className="text-slate-400 block">Radiação Acumulada</span>
                  <strong className="text-sm text-white">{payload.telemetria_nominal_resumida.radiacao_acumulada_msv} mSv</strong>
                </div>
              </div>
            </div>

            {/* Gráfico de Tendência */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Tendência de Sono vs. Linha de Base (14 dias)
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dados.serie_14_dias}>
                    <XAxis dataKey="dia_missao" stroke="#64748b" fontSize={11} />
                    <YAxis domain={[3, 10]} stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", fontSize: "12px" }}
                    />
                    <ReferenceLine
                      y={dados.serie_14_dias[0]?.base_sono}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                    />
                    <Line
                      type="monotone"
                      dataKey="sono_horas"
                      name="Sono (h)"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Coluna 3: Diagnóstico IA & Contramedidas (4 colunas) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Orientação do Copiloto IA
                  </h3>
                  <button
                    onClick={() => carregarAnalise(idAstronauta, diaMissao, true)}
                    disabled={loading}
                    className="text-xs px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/40"
                  >
                    {loading ? "Analisando..." : "Reanalisar com IA"}
                  </button>
                </div>

                {ia && (
                  <div className="space-y-4 text-sm">
                    <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                      <p className="font-semibold text-white">{ia.resumo_alerta}</p>
                    </div>

                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400">Por que isso ocorre no espaço?</span>
                      <p className="text-slate-300 text-xs mt-1 leading-relaxed">{ia.explicacao_fisiologica}</p>
                    </div>

                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400">Contramedidas Imediatas</span>
                      <ul className="mt-1.5 space-y-1.5">
                        {(ia.acao_imediata_astronauta ?? []).map((acao: string, idx: number) => (
                          <li key={idx} className="text-xs bg-slate-800/60 p-2.5 rounded-lg border-l-2 border-sky-400 text-slate-200">
                            {acao}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      <span className="font-bold text-slate-400 block mb-1">Protocolo de Escalonamento:</span>
                      <span className="text-slate-200">{ia.nivel_escalonamento}</span>
                    </div>
                  </div>
                )}
              </div>

              {ia?.fonte_analise && (
                <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-slate-800">
                  Motor: {ia.fonte_analise}
                </p>
              )}
            </div>
          </div>
        </main>
      )}
      </div>
    </div>
  );
}

export default App;
