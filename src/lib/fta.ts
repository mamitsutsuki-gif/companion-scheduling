export type FtaAction = {
  id: string;
  text: string;
  locked: boolean;
  /** 個別伴走プラン: スキルチェックで選んだ重点スキルとの紐づけ */
  focusSkillId?: string | null;
};

export type FtaElement = {
  id: string;
  text: string;
  locked: boolean;
  actions: FtaAction[];
};

export type FtaChart = {
  vision: { text: string; locked: boolean };
  elements: FtaElement[];
};

function safeId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

export function defaultFtaChart(): FtaChart {
  return {
    vision: { text: "", locked: false },
    elements: Array.from({ length: 4 }, (_, i) => ({
      id: safeId("b", i),
      text: "",
      locked: false,
      actions: Array.from({ length: 4 }, (_, j) => ({
        id: `${safeId("b", i)}-c-${j + 1}`,
        text: "",
        locked: false,
      })),
    })),
  };
}

export function normalizeFtaChart(input: unknown): FtaChart {
  const raw = (input ?? {}) as Record<string, unknown>;
  const visionRaw = (raw.vision ?? {}) as Record<string, unknown>;
  const elementsRaw = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = elementsRaw.slice(0, 8).map((e, i) => {
    const er = (e ?? {}) as Record<string, unknown>;
    const actionsRaw = Array.isArray(er.actions) ? er.actions : [];
    return {
      id: typeof er.id === "string" ? er.id : safeId("b", i),
      text: typeof er.text === "string" ? er.text.slice(0, 300) : "",
      locked: Boolean(er.locked),
      actions: actionsRaw.slice(0, 8).map((a, j) => {
        const ar = (a ?? {}) as Record<string, unknown>;
        return {
          id: typeof ar.id === "string" ? ar.id : `${safeId("b", i)}-c-${j + 1}`,
          text: typeof ar.text === "string" ? ar.text.slice(0, 300) : "",
          locked: Boolean(ar.locked),
          focusSkillId:
            typeof ar.focusSkillId === "string" && ar.focusSkillId.trim()
              ? ar.focusSkillId.trim().slice(0, 80)
              : null,
        };
      }),
    };
  });
  return {
    vision: {
      text: typeof visionRaw.text === "string" ? visionRaw.text.slice(0, 300) : "",
      locked: Boolean(visionRaw.locked),
    },
    elements,
  };
}

export function maskedFtaChartForViewer(chart: FtaChart): FtaChart {
  return {
    vision: {
      text: chart.vision.locked ? "" : chart.vision.text,
      locked: chart.vision.locked,
    },
    elements: chart.elements.map((e) => ({
      ...e,
      text: e.locked ? "" : e.text,
      actions: e.actions.map((a) => ({
        ...a,
        text: a.locked ? "" : a.text,
      })),
    })),
  };
}
