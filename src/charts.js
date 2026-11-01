// Chart.js 共通設定
import Chart from 'chart.js/auto';

Chart.defaults.color = '#6b7a8c';
Chart.defaults.font.family = "'Outfit', 'Noto Sans JP', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17,24,33,0.95)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.16)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.displayColors = false;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
Chart.defaults.animation.duration = 900;
Chart.defaults.animation.easing = 'easeOutQuart';

export { Chart };

export function verticalGradient(ctx, area, from, to) {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}
