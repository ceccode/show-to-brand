import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '../../lib/utils';
export function Table({ className, ...props }) {
    return _jsx("table", { className: cn('min-w-full text-sm', className), ...props });
}
export function TableHeader(props) { return _jsx("thead", { ...props }); }
export function TableBody(props) { return _jsx("tbody", { ...props }); }
export function TableRow({ className, ...props }) { return _jsx("tr", { className: cn('border-b', className), ...props }); }
export function TableHead({ className, ...props }) { return _jsx("th", { className: cn('p-2 text-left', className), ...props }); }
export function TableCell({ className, ...props }) { return _jsx("td", { className: cn('p-2', className), ...props }); }
