import * as React from 'react'
import { cn } from '../../lib/utils'

type TabsContextType = {
  value: string
  setValue: (v: string) => void
}
const TabsContext = React.createContext<TabsContextType | null>(null)

export function Tabs({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) {
  return <TabsContext.Provider value={{ value, setValue: onValueChange }}>{children}</TabsContext.Provider>
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex gap-4 border-b mb-4', className)}>{children}</div>
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(TabsContext)!
  const active = ctx.value === value
  return (
    <button
      className={cn('px-3 py-2 -mb-px border-b-2', active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600')}
      onClick={() => ctx.setValue(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(TabsContext)!
  if (ctx.value !== value) return null
  return <div>{children}</div>
}
