// ============================================================
// chartTheme.js
// Petit helper pour rendre les graphiques Recharts compatibles
// avec le thème dark/light (réutilise le ThemeContext global).
// ============================================================

import { useTheme } from '../context/ThemeContext';

/**
 * Hook qui retourne les couleurs de chart adaptées au thème actif.
 * À utiliser dans n'importe quel composant qui rend des Recharts.
 *
 *   const c = useChartTheme();
 *   <XAxis tick={{ fill: c.axis }} ... />
 *   <Tooltip contentStyle={c.tooltip} />
 */
export function useChartTheme() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return {
    isLight,
    // texte principal d'un chart (titres / valeurs / labels donut center)
    text:   isLight ? '#15192a' : '#f8fafc',
    // labels d'axes / ticks
    axis:   isLight ? '#475070' : '#8b96b4',
    // gridlines
    grid:   isLight ? 'rgba(20, 28, 60, 0.10)' : 'rgba(148, 163, 184, 0.11)',
    // stroke par défaut des secteurs du pie (sépare les tranches)
    pieStroke: isLight ? '#ffffff' : 'rgba(2, 8, 24, 0.85)',
    // accent gold (identique dans les deux thèmes)
    gold:   '#d6a76b',
    // style du tooltip Recharts
    tooltip: {
      backgroundColor: isLight ? '#ffffff' : '#0b142d',
      border: isLight
        ? '1px solid rgba(20, 28, 60, 0.12)'
        : '1px solid rgba(214,167,107,0.28)',
      borderRadius: 8,
      color: isLight ? '#15192a' : '#e8e6f0',
      fontSize: '0.82rem',
      boxShadow: isLight
        ? '0 10px 24px rgba(20, 28, 60, 0.12)'
        : '0 18px 40px rgba(0,0,0,0.35)',
    },
  };
}
