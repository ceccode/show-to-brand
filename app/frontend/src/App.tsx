import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Toaster, toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Switch } from './components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';

type BrandHit = {
  brand: string;
  certainty: number;
  input: string;
  context: string;
  alias_used?: string;
  timestamp_start?: string;
  timestamp_end?: string;
  source_id?: string;
  start_char?: number;
  end_char?: number;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload'|'url'|'text'|'settings'>(() => (localStorage.getItem('activeTab') as any) || 'upload');
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [useLLM, setUseLLM] = useState<boolean>(() => localStorage.getItem('useLLM') === 'true');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('openai_key') || '');
  const [loading, setLoading] = useState<'idle'|'reading'|'analyzing'>('idle');
  const [results, setResults] = useState<BrandHit[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  // table controls
  const [query, setQuery] = useState<string>(() => localStorage.getItem('query') || '');
  const [brandFilter, setBrandFilter] = useState<string>(() => localStorage.getItem('brandFilter') || '');
  const [sortKey, setSortKey] = useState<'brand'|'certainty'|'alias_used'|'timestamp_start'>(() => (localStorage.getItem('sortKey') as any) || 'certainty');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>(() => (localStorage.getItem('sortDir') as any) || 'desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => Number(localStorage.getItem('pageSize')) || 25);

  // persist controls
  useEffect(() => { localStorage.setItem('useLLM', String(useLLM)); }, [useLLM]);
  useEffect(() => { localStorage.setItem('query', query); }, [query]);
  useEffect(() => { localStorage.setItem('brandFilter', brandFilter); }, [brandFilter]);
  useEffect(() => { localStorage.setItem('sortKey', sortKey); }, [sortKey]);
  useEffect(() => { localStorage.setItem('sortDir', sortDir); }, [sortDir]);
  useEffect(() => { localStorage.setItem('pageSize', String(pageSize)); }, [pageSize]);
  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);
  useEffect(() => { if (apiKey) localStorage.setItem('openai_key', apiKey); else localStorage.removeItem('openai_key'); }, [apiKey]);

  const authHeaders = () => {
    const h: Record<string, string> = {};
    const k = apiKey.trim();
    if (k) h['X-OpenAI-Key'] = k;
    return h;
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []) as File[];
    const filtered = dropped.filter(f => /\.(txt|srt)$/i.test(f.name) && f.size <= 5*1024*1024);
    if (filtered.length) setFiles((prev: File[]) => [...prev, ...filtered]);
  };

  const resetAll = () => {
    const keys = ['activeTab','useLLM','query','brandFilter','sortKey','sortDir','pageSize','theme'];
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
        const { data } = await axios.post<BrandHit[]>('/api/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data', ...authHeaders() } });
        setResults(data);
      } else if (url) {
        setLoading('analyzing');
        const { data } = await axios.post<BrandHit[]>('/api/analyze', { url, useLLM }, { headers: authHeaders() });
        setResults(data);
      } else if (text.trim()) {
        setLoading('analyzing');
        const { data } = await axios.post<BrandHit[]>('/api/analyze', { text, useLLM }, { headers: authHeaders() });
        setResults(data);
      } else {
        toast.error('Provide input first');
      }
    } catch (e: any) {
      if (e?.response?.data?.code === 'OPENAI_KEY_MISSING') {
        toast.error(
          'OpenAI API key is required when using LLM mode. Please enter your API key in the header field or disable LLM mode.', 
          { duration: 6000 }
        );
      } else {
        toast.error(e?.response?.data?.message || 'Analyze failed');
      }
    } finally {
      setLoading('idle');
    }
  };

  // derive filtered/sorted/paged rows
  const normalized = (s: string | undefined) => (s || '').toLowerCase();
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
  const sorted = useMemo(() => [...filtered].sort((a,b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    let va: any = (a as any)[sortKey];
    let vb: any = (b as any)[sortKey];
    if (sortKey === 'certainty') return (va - vb) * dir;
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
    const header = ['brand','certainty','alias_used','input','context','timestamp_start','timestamp_end','source_id'];
    const rows = sorted.map(r => header.map(h => {
      const v = (r as any)[h];
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
    } catch {
      toast.error('Copy failed');
    }
  };

  const toggleSort = (key: 'brand'|'certainty'|'alias_used'|'timestamp_start') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Toaster richColors />
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-semibold">Brand Analyzer</h1>
              <p className="text-sm text-gray-600">Extract brands from text, URLs, or SRT subtitles. Toggle LLM for smarter detection without whitelists.</p>
            </div>
            <Button 
              aria-label="Reset all controls" 
              variant="ghost" 
              size="sm" 
              className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
              onClick={resetAll}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Reset all
            </Button>
          </div>
          
          <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-md border border-gray-100">
            <div className="flex items-center gap-2">
              <div className="text-blue-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </div>
              <span className="text-sm font-medium text-gray-700">OpenAI API Key:</span>
            </div>
            
            <div className="relative flex-1">
              <input
                aria-label="OpenAI API key"
                type="password"
                placeholder="Paste your OpenAI API key (sk-...)"
                className="border rounded-md px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            
            <Button
              aria-label="Check OpenAI key"
              variant="outline"
              size="sm"
              className="flex items-center gap-1 bg-white hover:bg-blue-50 border-blue-200 text-blue-700 hover:text-blue-800 px-3 py-2"
              onClick={async ()=>{
                try {
                  const { data } = await axios.get('/api/openai/check', { headers: authHeaders() });
                  toast.success(`OpenAI OK • models: ${data?.total ?? 'n/a'}`);
                } catch (e: any) {
                  toast.error(e?.response?.data?.message || e?.message || 'OpenAI check failed');
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              Check key
            </Button>
            
            <Button 
              aria-label="Clear key" 
              variant="ghost" 
              size="sm" 
              className="text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              onClick={()=> setApiKey('')}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 space-y-6">
        {/* Intro banner */}
        <div className="bg-blue-50 border border-blue-100 text-blue-900 rounded p-3">
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li><strong>Upload</strong> .txt/.srt, provide a <strong>URL</strong>, or paste <strong>Text</strong>.</li>
            <li>Search, filter, click headers to sort, and click rows to expand details.</li>
          </ul>
        </div>

        <div className="rounded-lg shadow p-4">
          <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(v as any)}>
            <TabsList>
              <TabsTrigger value="upload">upload</TabsTrigger>
              <TabsTrigger value="url">url</TabsTrigger>
              <TabsTrigger value="text">text</TabsTrigger>
            </TabsList>
            <TabsContent value="upload">
              <div onDragOver={(e)=>e.preventDefault()} onDrop={onDrop} className="border-2 border-dashed rounded p-6 text-center">
                <p className="font-medium">Drag & drop .txt or .srt files (max 5MB each)</p>
                <p className="text-xs">SRT cues are parsed with timestamps; each cue becomes a unit for detection.</p>
                <Input
                  aria-label="Upload files"
                  type="file"
                  multiple
                  accept=".txt,.srt"
                  className="mt-3"
                  onChange={(e) => {
                    const list = (e.target as HTMLInputElement).files;
                    const picked = Array.from(list ?? []) as File[];
                    const filtered = picked.filter(f => /\.(txt|srt)$/i.test(f.name) && f.size <= 5*1024*1024);
                    if (filtered.length) setFiles((prev: File[]) => [...prev, ...filtered]);
                  }}
                />
                <ul className="mt-3 text-left text-sm">
                  {files.map((f,i)=>(
                    <li key={i} className="flex justify-between">{f.name} <span>{(f.size/1024).toFixed(1)} KB</span> <button className="text-red-600" onClick={()=> setFiles(files.filter((_,j)=>j!==i))}>remove</button></li>
                  ))}
                </ul>
              </div>
            </TabsContent>
            <TabsContent value="url">
              <div className="space-y-3">
                <Input aria-label="Analyze URL" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://example.com" />
                <p className="text-xs">The backend fetches the page and extracts visible text before analysis.</p>
              </div>
            </TabsContent>
            <TabsContent value="text">
              <div className="space-y-2">
                <textarea aria-label="Analyze text" value={text} onChange={(e)=>setText(e.target.value)} rows={8} className="w-full border rounded px-3 py-2" placeholder="Paste text here..." />
                <p className="text-xs">Tip: Include a few surrounding sentences for better context scoring.</p>
              </div>
            </TabsContent>
          </Tabs>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={useLLM} onCheckedChange={setUseLLM} />
              <span className="text-sm">Use LLM</span>
            </div>
            <Button disabled={loading!=='idle' || (!files.length && !url && !text.trim())} onClick={analyze}>
              {loading==='idle' ? null : (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
              )}
              {loading==='idle' ? 'Analyze' : loading==='reading' ? 'Reading…' : 'Analyzing…'}
            </Button>
            <div className="text-xs">
              {files.length>0 && <span className="mr-3">{files.length} file(s) selected</span>}
              {text.trim().length>0 && <span className="mr-3">{text.trim().length} chars</span>}
              {url && <span className="mr-3">URL set</span>}
            </div>
          </div>
        </div>

        <div className="rounded-lg shadow p-4">
          {results.length===0 && loading==='idle' && (
            <div className="text-sm">
              <p className="font-medium">No results yet</p>
              <p>Use one of the input methods above and click Analyze. You can then search, filter, sort and export results.</p>
            </div>
          )}
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]"><label className="text-xs text-gray-600">Search</label><Input value={query} onChange={(e)=>{ setQuery(e.target.value); setPage(1); }} placeholder="Search brands, alias, input, context, source" /></div>
              <div><label className="text-xs text-gray-600">Brand</label><Input value={brandFilter} onChange={(e)=>{ setBrandFilter(e.target.value); setPage(1); }} className="w-40" placeholder="Filter brand" /></div>
              <div><label className="text-xs text-gray-600">Page size</label><Input type="number" value={pageSize} onChange={(e)=>{ setPageSize(Math.max(5, Number(e.target.value)||25)); setPage(1); }} className="w-24" /></div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={()=>downloadCsv()}>Export CSV</Button>
              <Button variant="ghost" size="sm" onClick={()=>copyJson()}>Copy JSON</Button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('brand')}>Brand {sortKey==='brand' && (sortDir==='asc'?'▲':'▼')}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('certainty')}>Certainty {sortKey==='certainty' && (sortDir==='asc'?'▲':'▼')}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('alias_used')}>Alias {sortKey==='alias_used' && (sortDir==='asc'?'▲':'▼')}</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={()=>toggleSort('timestamp_start')}>Start {sortKey==='timestamp_start' && (sortDir==='asc'?'▲':'▼')}</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r, i) => (
                  <>
                    <TableRow key={`${i}-row`} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(prev => ({...prev, [i]: !prev[i]}))}>
                      <TableCell>{r.brand}</TableCell>
                      <TableCell>{r.certainty.toFixed(2)}</TableCell>
                      <TableCell>{r.alias_used || ''}</TableCell>
                      <TableCell className="max-w-md truncate" title={r.input}>{r.input}</TableCell>
                      <TableCell className="max-w-md truncate" title={r.context}>{r.context}</TableCell>
                      <TableCell>{r.timestamp_start || ''}</TableCell>
                      <TableCell>{r.timestamp_end || ''}</TableCell>
                      <TableCell>{r.source_id || ''}</TableCell>
                    </TableRow>
                    {expanded[i] && (
                      <TableRow key={`${i}-details`} className="bg-gray-50">
                        <TableCell className="p-3 text-xs" colSpan={8}>
                          <div className="grid md:grid-cols-2 gap-3">
                            <div>
                              <div className="font-medium mb-1">Full input</div>
                              <pre className="whitespace-pre-wrap text-xs">{r.input}</pre>
                            </div>
                            <div>
                              <div className="font-medium mb-1">Full context</div>
                              <pre className="whitespace-pre-wrap text-xs">{r.context}</pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <div>Page {currentPage} / {totalPages}</div>
            <div className="flex gap-2">
              <button onClick={()=> setPage(p=> Math.max(1, p-1))} disabled={currentPage<=1} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
              <button onClick={()=> setPage(p=> Math.min(totalPages, p+1))} disabled={currentPage>=totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
