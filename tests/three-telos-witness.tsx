import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Aetheris,
  type ModelSession,
  type SelectionDescription,
} from "@aetheris/cad";
import { Viewport } from "../src/viewport/Viewport";
import type { ThemeName } from "../src/app/types";
import source from "../../Aetheris/fixtures/three-telos/model.firmament?raw";
declare global {
  interface Window {
    heliosTelosQualification: {
      compiled: boolean;
      revision: number;
      selected?: SelectionDescription | null;
    };
  }
}
window.heliosTelosQualification = { compiled: false, revision: 0 };
function Witness() {
  const [model, setModel] = useState<ModelSession | null>(null),
    [selected, setSelected] = useState<SelectionDescription | null>(null),
    [command, setCommand] = useState("iso-0");
  const [error, setError] = useState("");
  const [theme,setTheme] = useState<ThemeName>("mars");
  useEffect(() => {
    let runtime: Aetheris | null = null;
    let cancelled = false;
    void Aetheris.create({ worker: true })
      .then(async (value) => {
        runtime = value;
        const result = await value.compile(source);
        if (!result.model) throw new Error(JSON.stringify(result.diagnostics));
        if (!cancelled) {
          setModel(result.model);
          window.heliosTelosQualification.compiled = true;
        }
      })
      .catch((value) => setError(String(value)));
    return () => {
      cancelled = true;
      runtime?.terminate();
    };
  }, []);
  const refresh = async () => {
    if (!model) return;
    const result = await model.setSource(source.replace("40mm", "45mm"));
    if (!result.success) {
      setError(JSON.stringify(result.diagnostics));
      return;
    }
    setModel(Object.assign(Object.create(Object.getPrototypeOf(model)), model));
    window.heliosTelosQualification.revision = model.revision;
  };
  return (
    <>
      <h1>Real Helios wrapper + Firmament WASM</h1>
      <button onClick={() => setCommand("top-" + Date.now())}>Top</button>
      <button onClick={() => void refresh()}>Refresh</button>
      <button onClick={() => setTheme("mars")}>Mars viewport</button>
      <button onClick={() => setTheme("sirius")}>Sirius viewport</button>
      <div style={{ width: 800, height: 600, position: "relative" }}>
        <Viewport
          model={model}
          selectedEntityId={selected?.semanticEntityId ?? null}
          selectedTopologyId={selected?.faceId ?? null}
          theme={theme}
          displayMode="edges"
          viewMode="orthographic"
          viewCommand={command}
          selectionMode="face"
          onSelect={(_entity, _face, selection) => {
            setSelected(selection ?? null);
            window.heliosTelosQualification.selected = selection;
          }}
        />
      </div>
      <pre>
        {error ||
          (selected
            ? JSON.stringify(selected, null, 2)
            : model
              ? "COMPILED"
              : "COMPILING")}
      </pre>
    </>
  );
}
createRoot(document.querySelector("#root")!).render(<Witness />);
