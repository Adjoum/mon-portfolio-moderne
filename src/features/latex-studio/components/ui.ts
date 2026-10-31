// Classes communes du studio : cibles tactiles de 44 px sur mobile, focus visible au clavier.
const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 min-h-11 sm:min-h-9 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50'

export const btn = `${base} border border-[#2a313c] bg-[#21262d] text-gray-300 hover:bg-[#2a313c] hover:text-white`
export const btnPrimary = `${base} border border-transparent bg-gradient-to-br from-indigo-500 to-violet-500 text-white hover:from-indigo-400 hover:to-violet-400`
export const btnDanger = `${base} border border-red-900 bg-red-500/10 text-red-300 hover:bg-red-500/20`
export const btnGhost = `${base} text-gray-400 hover:bg-white/5 hover:text-white`
export const field = 'w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-400 focus:outline-none'
export const label = 'mb-1 block text-xs font-semibold text-gray-300'
