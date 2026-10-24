import { useState, useCallback } from "react"
import React from "react"

let memoryState = [] as any[]
let listeners = [] as any[]

function dispatch(action: any) {
  memoryState = action(memoryState)
  listeners.forEach((listener) => listener(memoryState))
}

export interface ToastOptions {
  title?: string
  description?: string
  variant?: "default" | "success" | "error"
  duration?: number
}

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_VALUE
  return count.toString()
}

export function toast(options: ToastOptions) {
  const id = genId()

  const update = (props: any) =>
    dispatch((state: any) =>
      state.map((t: any) => (t.id === id ? { ...t, ...props } : t))
    )

  const dismiss = () => dispatch((state: any) => state.filter((t: any) => t.id !== id))

  dispatch((state: any) => [
    ...state,
    {
      id,
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) dismiss()
      },
      ...options,
    },
  ])

  return { id, dismiss, update }
}

export function useToast() {
  const [state, setState] = useState(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    toasts: state,
    toast,
    dismiss: (id?: string) => {
      if (id) {
        dispatch((state: any) => state.filter((t: any) => t.id !== id))
      } else {
        dispatch(() => [])
      }
    },
  }
}
