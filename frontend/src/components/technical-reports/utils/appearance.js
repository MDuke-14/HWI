export const getTechnicalReportsAppearance = (isDark) => ({
  bgMain: isDark ? 'bg-[#0a0a0a]' : 'bg-gray-100',
  bgCard: isDark ? 'bg-[#1a1a1a]' : 'bg-white',
  bgCardAlt: isDark ? 'bg-[#0f0f0f]' : 'bg-gray-50',
  textPrimary: isDark ? 'text-white' : 'text-gray-900',
  textSecondary: isDark ? 'text-gray-400' : 'text-gray-600',
  borderColor: isDark ? 'border-gray-700' : 'border-gray-200',
});

export default getTechnicalReportsAppearance;
