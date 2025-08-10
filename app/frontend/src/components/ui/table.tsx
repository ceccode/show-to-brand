import * as React from 'react'
import { cn } from '../../lib/utils'

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('min-w-full text-sm', className)} {...props} />
}
export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) { return <thead {...props} /> }
export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) { return <tbody {...props} /> }
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) { return <tr className={cn('border-b', className)} {...props} /> }
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) { return <th className={cn('p-2 text-left', className)} {...props} /> }
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn('p-2', className)} {...props} /> }
