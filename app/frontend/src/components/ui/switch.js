import { jsx as _jsx } from "react/jsx-runtime";
export function Switch({ checked, onCheckedChange, className, ...props }) {
    return (_jsx("button", { role: "switch", "aria-checked": checked, onClick: () => onCheckedChange?.(!checked), className: 'inline-flex h-6 w-11 items-center rounded-full transition ' +
            (checked ? 'bg-blue-600' : 'bg-gray-300'), children: _jsx("span", { className: 'inline-block h-5 w-5 transform rounded-full bg-white transition ' +
                (checked ? 'translate-x-5' : 'translate-x-1') }) }));
}
