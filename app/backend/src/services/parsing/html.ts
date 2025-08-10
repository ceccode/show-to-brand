import axios from 'axios';
import * as cheerio from 'cheerio';

export async function parseHtmlVisibleText(url: string): Promise<{ text: string }> {
  const timeout = Number(process.env.URL_FETCH_TIMEOUT_MS || 10000);
  const resp = await axios.get(url, {
    responseType: 'text',
    timeout,
    headers: { 'User-Agent': 'BrandAnalyzerBot/1.0' }
  });
  const ct = resp.headers['content-type'] || '';
  if (!ct.includes('text/html')) {
    throw Object.assign(new Error('URL is not HTML'), { status: 415 });
  }
  const $ = cheerio.load(resp.data);
  // Remove non-visible elements
  ['script','style','noscript','meta','link','svg','img','video','audio','picture','source','iframe'].forEach(sel => $(sel).remove());
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return { text };
}
