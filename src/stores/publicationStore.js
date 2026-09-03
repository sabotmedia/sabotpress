import { createStore } from './createStore'
import { createPublication } from '../models/publication'

export const PublicationStore = createStore({
  publication: createPublication(),
  posts: [],
  issues: [],
  pages: [],
  collections: [],
  projects: [],
})

export function usePublicationStore(selector) {
  return PublicationStore.useStore(selector)
}
