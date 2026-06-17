export type PinnedInsight = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
};

export type ThemeNotesPrefs = {
  generalNote: string;
  generalUpdatedAt?: string;
  pinnedInsights: PinnedInsight[];
  hiddenBlockNoteIds: string[];
};

export const defaultThemeNotesPrefs = (): ThemeNotesPrefs => ({
  generalNote: "",
  generalUpdatedAt: undefined,
  pinnedInsights: [],
  hiddenBlockNoteIds: [],
});

export const createThemeNotesPrefsKey = (userId: string, themeId: string) =>
  `theme-notes:${userId}:${themeId}`;

export const loadThemeNotesPrefs = (userId: string, themeId: string): ThemeNotesPrefs => {
  try {
    const savedPrefs = window.localStorage.getItem(createThemeNotesPrefsKey(userId, themeId));
    if (!savedPrefs) return defaultThemeNotesPrefs();
    return { ...defaultThemeNotesPrefs(), ...(JSON.parse(savedPrefs) as Partial<ThemeNotesPrefs>) };
  } catch {
    return defaultThemeNotesPrefs();
  }
};

export const saveThemeNotesPrefs = (userId: string, themeId: string, prefs: ThemeNotesPrefs) => {
  window.localStorage.setItem(createThemeNotesPrefsKey(userId, themeId), JSON.stringify(prefs));
};

export const saveThemeGeneralNote = (userId: string, themeId: string, content: string) => {
  const nextPrefs: ThemeNotesPrefs = {
    ...loadThemeNotesPrefs(userId, themeId),
    generalNote: content,
    generalUpdatedAt: new Date().toISOString(),
  };
  saveThemeNotesPrefs(userId, themeId, nextPrefs);
  return nextPrefs;
};
