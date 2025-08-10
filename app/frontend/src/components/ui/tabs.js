import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { cn } from '../../lib/utils';
const TabsContext = React.createContext(null);
export function Tabs({ value, onValueChange, children }) {
    return _jsx(TabsContext.Provider, { value: { value, setValue: onValueChange }, children: children });
}
export function TabsList({ className, children }) {
    return _jsx("div", { className: cn('flex gap-4 border-b mb-4', className), children: children });
}
export function TabsTrigger({ value, children }) {
    const ctx = React.useContext(TabsContext);
    const active = ctx.value === value;
    return (_jsx("button", { className: cn('px-3 py-2 -mb-px border-b-2', active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600'), onClick: () => ctx.setValue(value), children: children }));
}
export function TabsContent({ value, children }) {
    const ctx = React.useContext(TabsContext);
    if (ctx.value !== value)
        return null;
    return _jsx("div", { children: children });
}
