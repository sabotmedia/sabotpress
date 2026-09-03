import { createStore } from './createStore'

export const SearchStore = createStore({
  query: '',
  filters: {},
  results: [],
})

export function useSearchStore(selector) {
  return SearchStore.useStore(selector)
}
