/**
 * The app's single source of truth: settings in, dataset and analysis out.
 *
 * Generation and analysis are memoised separately, so moving the changepoint
 * window or the blank-handling rule re-runs only the analysis and leaves the
 * class exactly as it was.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateDataset } from '../data/generator';
import type { Dataset } from '../data/types';
import { analyze } from '../analysis/index';
import type { Analysis } from '../analysis/index';
import type { GenerationSettings, Settings, TopicSetting } from './settings';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

const SEED_WORDS = [
  'algebra', 'quartile', 'vertex', 'radian', 'lattice', 'isosceles', 'tangent',
  'median', 'scalene', 'parabola', 'ratio', 'vector', 'prism', 'chord', 'locus',
];

/** A fresh, readable seed for the Regenerate button. */
export function randomSeed(): string {
  const word = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)] ?? 'seed';
  return `${word}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

export interface AppState {
  settings: Settings;
  dataset: Dataset;
  analysis: Analysis;
  update: (patch: Partial<Settings>) => void;
  updateTopic: (topicId: number, patch: Partial<TopicSetting>) => void;
  regenerate: () => void;
  reset: () => void;
}

export function useAppState(): AppState {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const generation: GenerationSettings = useMemo(
    () => ({
      seed: settings.seed,
      studentCount: settings.studentCount,
      topics: settings.topics,
      blankRate: settings.blankRate,
      rapidRate: settings.rapidRate,
      blankThenReturnProbability: settings.blankThenReturnProbability,
      returnTiming: settings.returnTiming,
      revisionPropensity: settings.revisionPropensity,
    }),
    [
      settings.seed,
      settings.studentCount,
      settings.topics,
      settings.blankRate,
      settings.rapidRate,
      settings.blankThenReturnProbability,
      settings.returnTiming,
      settings.revisionPropensity,
    ],
  );

  const dataset = useMemo(() => generateDataset(generation), [generation]);

  const analysis = useMemo(
    () =>
      analyze(dataset, {
        changepointWindowK: settings.changepointWindowK,
        blankHandling: settings.blankHandling,
      }),
    [dataset, settings.changepointWindowK, settings.blankHandling],
  );

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const updateTopic = useCallback((topicId: number, patch: Partial<TopicSetting>) => {
    setSettings((previous) => ({
      ...previous,
      topics: previous.topics.map((topic) =>
        topic.id === topicId ? { ...topic, ...patch } : topic,
      ),
    }));
  }, []);

  const regenerate = useCallback(() => {
    setSettings((previous) => ({ ...previous, seed: randomSeed() }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, dataset, analysis, update, updateTopic, regenerate, reset };
}

/** Track an element's rendered width, so SVG coordinates can map to screen px. */
export function useElementWidth<T extends HTMLElement>(): [
  (node: T | null) => void,
  number,
] {
  const [width, setWidth] = useState(0);
  const [node, setNode] = useState<T | null>(null);

  useEffect(() => {
    if (node === null) return undefined;
    const update = (): void => setWidth(node.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, width];
}

/** Light or dark, remembered across visits. */
export type Theme = 'light' | 'dark';

const THEME_KEY = 'solace-demo-theme';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage blocked; the theme just won't survive a reload.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'));
  }, []);

  return [theme, toggle];
}
