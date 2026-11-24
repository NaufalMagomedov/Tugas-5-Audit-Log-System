import { useEffect, useState } from "react";

type Stall = { id: number; name: string; description: string };
type Mode = "success" | "empty" | "error";

const dummyStalls: Stall[] = [
  { id: 1, name: "Warung Bu Sri", description: "Nasi pecel dan gorengan" },
  { id: 2, name: "Kantin Pak Joko", description: "Soto dan es teh" },
];

function fakeFetchStalls(mode: Mode): Promise<Stall[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (mode === "error") reject(new Error("Gagal memuat data warung"));
      else if (mode === "empty") resolve([]);
      else resolve(dummyStalls);
    }, 2000);
  });
}

export default function StallListDemo() {
  const [mode, setMode] = useState<Mode>("success");
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedMode, setLoadedMode] = useState<Mode | null>(null);

  // Loading diturunkan: selama mode yang diminta belum selesai dimuat.
  const loading = loadedMode !== mode;

  useEffect(() => {
    let active = true;

    fakeFetchStalls(mode)
      .then((rows) => {
        if (!active) return;
        setStalls(rows);
        setError(null);
      })
      .catch((e: Error) => {
        if (!active) return;
        setError(e.message);
      })
      .finally(() => {
        if (!active) return;
        setLoadedMode(mode);
      });

    return () => {
      active = false;
    };
  }, [mode]);

  return (
    <div>
      <div>
        <button onClick={() => setMode("success")}>Berhasil</button>
        <button onClick={() => setMode("empty")}>Kosong</button>
        <button onClick={() => setMode("error")}>Error</button>
      </div>

      {loading && <p>Memuat data warung...</p>}
      {!loading && error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && stalls.length === 0 && <p>Belum ada warung.</p>}
      {!loading && !error && stalls.map((s) => (
        <div key={s.id}>
          <h3>{s.name}</h3>
          <p>{s.description}</p>
        </div>
      ))}
    </div>
  );
}