import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Toaster, toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Switch } from './components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
export default function App() {
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'upload');
    const [files, setFiles] = useState([]);
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [useLLM, setUseLLM] = useState(() => localStorage.getItem('useLLM') === 'true');
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_key') || '');
    const [loading, setLoading] = useState('idle');
    const [results, setResults] = useState([]);
    const [expanded, setExpanded] = useState({});
    // table controls
    const [query, setQuery] = useState(() => localStorage.getItem('query') || '');
    const [brandFilter, setBrandFilter] = useState(() => localStorage.getItem('brandFilter') || '');
    const [sortKey, setSortKey] = useState(() => localStorage.getItem('sortKey') || 'certainty');
    const [sortDir, setSortDir] = useState(() => localStorage.getItem('sortDir') || 'desc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem('pageSize')) || 25);
    // persist controls
    useEffect(() => { localStorage.setItem('useLLM', String(useLLM)); }, [useLLM]);
    useEffect(() => { localStorage.setItem('query', query); }, [query]);
    useEffect(() => { localStorage.setItem('brandFilter', brandFilter); }, [brandFilter]);
    useEffect(() => { localStorage.setItem('sortKey', sortKey); }, [sortKey]);
    useEffect(() => { localStorage.setItem('sortDir', sortDir); }, [sortDir]);
    useEffect(() => { localStorage.setItem('pageSize', String(pageSize)); }, [pageSize]);
    useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);
    useEffect(() => { if (apiKey)
        localStorage.setItem('openai_key', apiKey);
    else
        localStorage.removeItem('openai_key'); }, [apiKey]);
    const authHeaders = () => {
        const h = {};
        const k = apiKey.trim();
        if (k)
            h['X-OpenAI-Key'] = k;
        return h;
    };
    const onDrop = (e) => {
        e.preventDefault();
        const dropped = Array.from(e.dataTransfer.files || []);
        const filtered = dropped.filter(f => /\.(txt|srt)$/i.test(f.name) && f.size <= 5 * 1024 * 1024);
        if (filtered.length)
            setFiles((prev) => [...prev, ...filtered]);
    };
    const resetAll = () => {
        const keys = ['activeTab', 'useLLM', 'query', 'brandFilter', 'sortKey', 'sortDir', 'pageSize', 'theme'];
        keys.forEach(k => localStorage.removeItem(k));
        setActiveTab('upload');
        setFiles([]);
        setUrl('');
        setText('');
        setUseLLM(false);
        setLoading('idle');
        setResults([]);
        setExpanded({});
        setQuery('');
        setBrandFilter('');
        setSortKey('certainty');
        setSortDir('desc');
        setPage(1);
        setPageSize(25);
        toast.success('All controls reset');
    };
    const analyze = async () => {
        try {
            setLoading('reading');
            setResults([]);
            setPage(1);
            if (files.length) {
                const fd = new FormData();
                files.forEach(f => fd.append('files', f));
                fd.append('useLLM', String(useLLM));
                setLoading('analyzing');
                const { data } = await axios.post('/api/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data', ...authHeaders() } });
                setResults(data);
            }
            else if (url) {
                setLoading('analyzing');
                const { data } = await axios.post('/api/analyze', { url, useLLM }, { headers: authHeaders() });
                setResults(data);
            }
            else if (text.trim()) {
                setLoading('analyzing');
                const { data } = await axios.post('/api/analyze', { text, useLLM }, { headers: authHeaders() });
                setResults(data);
            }
            else {
                toast.error('Provide input first');
            }
        }
        catch (e) {
            toast.error(e?.response?.data?.message || 'Analyze failed');
        }
        finally {
            setLoading('idle');
        }
    };
    // derive filtered/sorted/paged rows
    const normalized = (s) => (s || '').toLowerCase();
    const filtered = useMemo(() => results.filter(r => {
        const q = normalized(query);
        const bf = normalized(brandFilter);
        const matchesQuery = !q ||
            normalized(r.brand).includes(q) ||
            normalized(r.alias_used).includes(q) ||
            normalized(r.input).includes(q) ||
            normalized(r.context).includes(q) ||
            normalized(r.source_id).includes(q);
        const matchesBrand = !bf || normalized(r.brand).includes(bf);
        return matchesQuery && matchesBrand;
    }), [results, query, brandFilter]);
    const sorted = useMemo(() => [...filtered].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        let va = a[sortKey];
        let vb = b[sortKey];
        if (sortKey === 'certainty')
            return (va - vb) * dir;
        va = (va ?? '').toString();
        vb = (vb ?? '').toString();
        return va.localeCompare(vb) * dir;
    }), [filtered, sortKey, sortDir]);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const paged = sorted.slice(start, start + pageSize);
    const downloadCsv = () => {
        const header = ['brand', 'certainty', 'alias_used', 'input', 'context', 'timestamp_start', 'timestamp_end', 'source_id'];
        const rows = sorted.map(r => header.map(h => {
            const v = r[h];
            const s = v === undefined ? '' : String(v);
            const escaped = '"' + s.replace(/"/g, '""') + '"';
            return escaped;
        }).join(','));
        const csv = [header.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'brand_hits.csv';
        a.click();
        URL.revokeObjectURL(url);
    };
    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(sorted, null, 2));
            toast.success('JSON copied');
        }
        catch {
            toast.error('Copy failed');
        }
    };
    const toggleSort = (key) => {
        if (sortKey === key)
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else {
            setSortKey(key);
            setSortDir('asc');
        }
    };
    return (_jsxs("div", { className: "min-h-screen bg-gray-50 text-gray-900", children: [_jsx(Toaster, { richColors: true }), _jsx("header", { className: "border-b bg-white", children: _jsxs("div", { className: "mx-auto max-w-6xl px-6 pt-5 pb-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Brand Analyzer" }), _jsx("p", { className: "text-sm text-gray-600", children: "Extract brands from text, URLs, or SRT subtitles. Toggle LLM for smarter detection without whitelists." })] }), _jsxs(Button, { "aria-label": "Reset all controls", variant: "ghost", size: "sm", className: "text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1", onClick: resetAll, children: [_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }), _jsx("path", { d: "M3 3v5h5" })] }), "Reset all"] })] }), _jsxs("div", { className: "flex items-center gap-3 bg-gray-50 p-3 rounded-md border border-gray-100", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "text-blue-500", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" }) }) }), _jsx("span", { className: "text-sm font-medium text-gray-700", children: "OpenAI API Key:" })] }), _jsx("div", { className: "relative flex-1", children: _jsx("input", { "aria-label": "OpenAI API key", type: "password", placeholder: "Paste your OpenAI API key (sk-...)", className: "border rounded-md px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all", value: apiKey, onChange: (e) => setApiKey(e.target.value) }) }), _jsxs(Button, { "aria-label": "Check OpenAI key", variant: "outline", size: "sm", className: "flex items-center gap-1 bg-white hover:bg-blue-50 border-blue-200 text-blue-700 hover:text-blue-800 px-3 py-2", onClick: async () => {
                                        try {
                                            const { data } = await axios.get('/api/openai/check', { headers: authHeaders() });
                                            toast.success(`OpenAI OK • models: ${data?.total ?? 'n/a'}`);
                                        }
                                        catch (e) {
                                            toast.error(e?.response?.data?.message || e?.message || 'OpenAI check failed');
                                        }
                                    }, children: [_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M20 6L9 17l-5-5" }) }), "Check key"] }), _jsx(Button, { "aria-label": "Clear key", variant: "ghost", size: "sm", className: "text-gray-600 hover:text-gray-800 hover:bg-gray-100", onClick: () => setApiKey(''), children: "Clear" })] })] }) }), _jsxs("main", { className: "mx-auto max-w-6xl p-4 space-y-6", children: [_jsx("div", { className: "bg-blue-50 border border-blue-100 text-blue-900 rounded p-3", children: _jsxs("ul", { className: "list-disc pl-5 text-sm space-y-1", children: [_jsxs("li", { children: [_jsx("strong", { children: "Upload" }), " .txt/.srt, provide a ", _jsx("strong", { children: "URL" }), ", or paste ", _jsx("strong", { children: "Text" }), "."] }), _jsx("li", { children: "Search, filter, click headers to sort, and click rows to expand details." })] }) }), _jsxs("div", { className: "rounded-lg shadow p-4", children: [_jsxs(Tabs, { value: activeTab, onValueChange: (v) => setActiveTab(v), children: [_jsxs(TabsList, { children: [_jsx(TabsTrigger, { value: "upload", children: "upload" }), _jsx(TabsTrigger, { value: "url", children: "url" }), _jsx(TabsTrigger, { value: "text", children: "text" })] }), _jsx(TabsContent, { value: "upload", children: _jsxs("div", { onDragOver: (e) => e.preventDefault(), onDrop: onDrop, className: "border-2 border-dashed rounded p-6 text-center", children: [_jsx("p", { className: "font-medium", children: "Drag & drop .txt or .srt files (max 5MB each)" }), _jsx("p", { className: "text-xs", children: "SRT cues are parsed with timestamps; each cue becomes a unit for detection." }), _jsx(Input, { "aria-label": "Upload files", type: "file", multiple: true, accept: ".txt,.srt", className: "mt-3", onChange: (e) => {
                                                        const list = e.target.files;
                                                        const picked = Array.from(list ?? []);
                                                        const filtered = picked.filter(f => /\.(txt|srt)$/i.test(f.name) && f.size <= 5 * 1024 * 1024);
                                                        if (filtered.length)
                                                            setFiles((prev) => [...prev, ...filtered]);
                                                    } }), _jsx("ul", { className: "mt-3 text-left text-sm", children: files.map((f, i) => (_jsxs("li", { className: "flex justify-between", children: [f.name, " ", _jsxs("span", { children: [(f.size / 1024).toFixed(1), " KB"] }), " ", _jsx("button", { className: "text-red-600", onClick: () => setFiles(files.filter((_, j) => j !== i)), children: "remove" })] }, i))) })] }) }), _jsx(TabsContent, { value: "url", children: _jsxs("div", { className: "space-y-3", children: [_jsx(Input, { "aria-label": "Analyze URL", value: url, onChange: (e) => setUrl(e.target.value), placeholder: "https://example.com" }), _jsx("p", { className: "text-xs", children: "The backend fetches the page and extracts visible text before analysis." })] }) }), _jsx(TabsContent, { value: "text", children: _jsxs("div", { className: "space-y-2", children: [_jsx("textarea", { "aria-label": "Analyze text", value: text, onChange: (e) => setText(e.target.value), rows: 8, className: "w-full border rounded px-3 py-2", placeholder: "Paste text here..." }), _jsx("p", { className: "text-xs", children: "Tip: Include a few surrounding sentences for better context scoring." })] }) })] }), _jsxs("div", { className: "mt-4 flex items-center gap-3 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Switch, { checked: useLLM, onCheckedChange: setUseLLM }), _jsx("span", { className: "text-sm", children: "Use LLM" })] }), _jsxs(Button, { disabled: loading !== 'idle' || (!files.length && !url && !text.trim()), onClick: analyze, children: [loading === 'idle' ? null : (_jsxs("svg", { className: "h-4 w-4 animate-spin", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" })] })), loading === 'idle' ? 'Analyze' : loading === 'reading' ? 'Reading…' : 'Analyzing…'] }), _jsxs("div", { className: "text-xs", children: [files.length > 0 && _jsxs("span", { className: "mr-3", children: [files.length, " file(s) selected"] }), text.trim().length > 0 && _jsxs("span", { className: "mr-3", children: [text.trim().length, " chars"] }), url && _jsx("span", { className: "mr-3", children: "URL set" })] })] })] }), _jsxs("div", { className: "rounded-lg shadow p-4", children: [results.length === 0 && loading === 'idle' && (_jsxs("div", { className: "text-sm", children: [_jsx("p", { className: "font-medium", children: "No results yet" }), _jsx("p", { children: "Use one of the input methods above and click Analyze. You can then search, filter, sort and export results." })] })), _jsxs("div", { className: "mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between", children: [_jsxs("div", { className: "flex gap-2 items-end flex-wrap", children: [_jsxs("div", { className: "flex-1 min-w-[200px]", children: [_jsx("label", { className: "text-xs text-gray-600", children: "Search" }), _jsx(Input, { value: query, onChange: (e) => { setQuery(e.target.value); setPage(1); }, placeholder: "Search brands, alias, input, context, source" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs text-gray-600", children: "Brand" }), _jsx(Input, { value: brandFilter, onChange: (e) => { setBrandFilter(e.target.value); setPage(1); }, className: "w-40", placeholder: "Filter brand" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs text-gray-600", children: "Page size" }), _jsx(Input, { type: "number", value: pageSize, onChange: (e) => { setPageSize(Math.max(5, Number(e.target.value) || 25)); setPage(1); }, className: "w-24" })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => downloadCsv(), children: "Export CSV" }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => copyJson(), children: "Copy JSON" })] })] }), _jsx("div", { className: "overflow-x-auto hidden md:block", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsxs(TableHead, { className: "cursor-pointer select-none", onClick: () => toggleSort('brand'), children: ["Brand ", sortKey === 'brand' && (sortDir === 'asc' ? '▲' : '▼')] }), _jsxs(TableHead, { className: "cursor-pointer select-none", onClick: () => toggleSort('certainty'), children: ["Certainty ", sortKey === 'certainty' && (sortDir === 'asc' ? '▲' : '▼')] }), _jsxs(TableHead, { className: "cursor-pointer select-none", onClick: () => toggleSort('alias_used'), children: ["Alias ", sortKey === 'alias_used' && (sortDir === 'asc' ? '▲' : '▼')] }), _jsx(TableHead, { children: "Input" }), _jsx(TableHead, { children: "Context" }), _jsxs(TableHead, { className: "cursor-pointer select-none", onClick: () => toggleSort('timestamp_start'), children: ["Start ", sortKey === 'timestamp_start' && (sortDir === 'asc' ? '▲' : '▼')] }), _jsx(TableHead, { children: "End" }), _jsx(TableHead, { children: "Source" })] }) }), _jsx(TableBody, { children: paged.map((r, i) => (_jsxs(_Fragment, { children: [_jsxs(TableRow, { className: "hover:bg-gray-50 cursor-pointer", onClick: () => setExpanded(prev => ({ ...prev, [i]: !prev[i] })), children: [_jsx(TableCell, { children: r.brand }), _jsx(TableCell, { children: r.certainty.toFixed(2) }), _jsx(TableCell, { children: r.alias_used || '' }), _jsx(TableCell, { className: "max-w-md truncate", title: r.input, children: r.input }), _jsx(TableCell, { className: "max-w-md truncate", title: r.context, children: r.context }), _jsx(TableCell, { children: r.timestamp_start || '' }), _jsx(TableCell, { children: r.timestamp_end || '' }), _jsx(TableCell, { children: r.source_id || '' })] }, `${i}-row`), expanded[i] && (_jsx(TableRow, { className: "bg-gray-50", children: _jsx(TableCell, { className: "p-3 text-xs", colSpan: 8, children: _jsxs("div", { className: "grid md:grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium mb-1", children: "Full input" }), _jsx("pre", { className: "whitespace-pre-wrap text-xs", children: r.input })] }), _jsxs("div", { children: [_jsx("div", { className: "font-medium mb-1", children: "Full context" }), _jsx("pre", { className: "whitespace-pre-wrap text-xs", children: r.context })] })] }) }) }, `${i}-details`))] }))) })] }) }), _jsxs("div", { className: "mt-3 flex items-center justify-between text-sm", children: [_jsxs("div", { children: ["Page ", currentPage, " / ", totalPages] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => setPage(p => Math.max(1, p - 1)), disabled: currentPage <= 1, className: "px-3 py-1 border rounded disabled:opacity-50", children: "Prev" }), _jsx("button", { onClick: () => setPage(p => Math.min(totalPages, p + 1)), disabled: currentPage >= totalPages, className: "px-3 py-1 border rounded disabled:opacity-50", children: "Next" })] })] })] })] })] }));
}
