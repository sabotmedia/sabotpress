import { useEffect, useState } from 'react'

export function createStore(initialState = {}) {
  let state = initialState
  const listeners = new Set()

  function getSnapshot() {
    return state
  }

  function setState(update) {
    state = typeof update === 'function' ? update(state) : { ...state, ...update }
    listeners.forEach((listener) => listener(state))
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function useStore(selector = (value) => value) {
    const [selected, setSelected] = useState(() => selector(state))

    useEffect(() => subscribe((next) => setSelected(selector(next))), [selector])

    return selected
  }

  return {
    getSnapshot,
    setState,
    subscribe,
    useStore,
  }
}
