import { createStore } from './createStore'
import { DEFAULT_PRINT_OPTIONS, PrintLayouts } from '../print/printEngine'

export const PrintStore = createStore({
  layout: PrintLayouts.ARTICLE,
  options: { ...DEFAULT_PRINT_OPTIONS },
  selectedSourceId: '',
  lastRender: null,
})

export function usePrintStore(selector) {
  return PrintStore.useStore(selector)
}
