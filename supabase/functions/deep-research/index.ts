import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DEEP-RESEARCH] ${step}${detailsStr}`);
};

// Academic database interfaces
interface AcademicSource {
  id: string;
  title: string;
  authors: string[];
  year: number;
  type: 'journal' | 'book' | 'article' | 'conference' | 'preprint' | 'thesis' | 'report';
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  abstract?: string;
  citationCount?: number;
  verified: boolean;
  database: string;
  peerReviewed: boolean;
}

interface ResearchResult {
  sources: AcademicSource[];
  metadata: {
    totalSources: number;
    verifiedSources: number;
    peerReviewedSources: number;
    databasesCovered: string[];
    researchDate: string;
    confidenceScore: 'high' | 'moderate' | 'low' | 'insufficient';
    topicCoverage: number; // 0-100%
  };
  suggestedRefinements?: string[];
  error?: string;
}

// Query OpenAlex (free, comprehensive)
async function queryOpenAlex(topic: string, category: string): Promise<AcademicSource[]> {
  logStep("Querying OpenAlex", { topic: topic.slice(0, 50) });
  
  try {
    const searchQuery = encodeURIComponent(`${topic} ${category.replace(/_/g, ' ')}`);
    const response = await fetch(
      `https://api.openalex.org/works?search=${searchQuery}&filter=is_paratext:false,type:journal-article|book|book-chapter&per_page=20&sort=cited_by_count:desc`,
      {
        headers: {
          "User-Agent": "ScrollLibrary/1.0 (mailto:support@scrolllibrary.org)"
        }
      }
    );

    if (!response.ok) {
      logStep("OpenAlex error", { status: response.status });
      return [];
    }

    const data = await response.json();
    const results = data.results || [];
    
    logStep("OpenAlex results", { count: results.length });

    return results.map((work: any) => ({
      id: work.id,
      title: work.title || "Untitled",
      authors: (work.authorships || []).slice(0, 5).map((a: any) => 
        a.author?.display_name || "Unknown Author"
      ),
      year: work.publication_year || new Date().getFullYear(),
      type: mapOpenAlexType(work.type),
      doi: work.doi?.replace("https://doi.org/", ""),
      url: work.doi || work.primary_location?.landing_page_url,
      journal: work.primary_location?.source?.display_name,
      publisher: work.primary_location?.source?.host_organization_name,
      abstract: work.abstract_inverted_index ? reconstructAbstract(work.abstract_inverted_index) : undefined,
      citationCount: work.cited_by_count || 0,
      verified: !!work.doi,
      database: "OpenAlex",
      peerReviewed: work.primary_location?.source?.type === "journal",
    }));
  } catch (error) {
    logStep("OpenAlex error", { error: String(error) });
    return [];
  }
}

function mapOpenAlexType(type: string): AcademicSource['type'] {
  const typeMap: Record<string, AcademicSource['type']> = {
    'journal-article': 'journal',
    'book': 'book',
    'book-chapter': 'book',
    'proceedings-article': 'conference',
    'posted-content': 'preprint',
    'dissertation': 'thesis',
  };
  return typeMap[type] || 'article';
}

function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  if (!invertedIndex) return "";
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(w => w[1]).join(" ").slice(0, 500);
}

// Query CrossRef (DOI verification)
async function queryCrossRef(topic: string): Promise<AcademicSource[]> {
  logStep("Querying CrossRef", { topic: topic.slice(0, 50) });
  
  try {
    const searchQuery = encodeURIComponent(topic);
    const response = await fetch(
      `https://api.crossref.org/works?query=${searchQuery}&rows=15&filter=type:journal-article,has-abstract:true&sort=is-referenced-by-count&order=desc`,
      {
        headers: {
          "User-Agent": "ScrollLibrary/1.0 (mailto:support@scrolllibrary.org)"
        }
      }
    );

    if (!response.ok) {
      logStep("CrossRef error", { status: response.status });
      return [];
    }

    const data = await response.json();
    const items = data.message?.items || [];
    
    logStep("CrossRef results", { count: items.length });

    return items.map((item: any) => ({
      id: item.DOI,
      title: item.title?.[0] || "Untitled",
      authors: (item.author || []).slice(0, 5).map((a: any) => 
        `${a.family || ''}, ${a.given || ''}`.trim()
      ),
      year: item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      type: 'journal' as const,
      doi: item.DOI,
      url: `https://doi.org/${item.DOI}`,
      journal: item['container-title']?.[0],
      publisher: item.publisher,
      abstract: item.abstract?.replace(/<[^>]*>/g, '').slice(0, 500),
      citationCount: item['is-referenced-by-count'] || 0,
      verified: true,
      database: "CrossRef",
      peerReviewed: true,
    }));
  } catch (error) {
    logStep("CrossRef error", { error: String(error) });
    return [];
  }
}

// Query Semantic Scholar
async function querySemanticScholar(topic: string): Promise<AcademicSource[]> {
  logStep("Querying Semantic Scholar", { topic: topic.slice(0, 50) });
  
  try {
    const searchQuery = encodeURIComponent(topic);
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${searchQuery}&limit=15&fields=paperId,title,authors,year,venue,externalIds,abstract,citationCount,publicationTypes`,
      {
        headers: {
          "User-Agent": "ScrollLibrary/1.0"
        }
      }
    );

    if (!response.ok) {
      logStep("Semantic Scholar error", { status: response.status });
      return [];
    }

    const data = await response.json();
    const papers = data.data || [];
    
    logStep("Semantic Scholar results", { count: papers.length });

    return papers.map((paper: any) => ({
      id: paper.paperId,
      title: paper.title || "Untitled",
      authors: (paper.authors || []).slice(0, 5).map((a: any) => a.name || "Unknown"),
      year: paper.year || new Date().getFullYear(),
      type: mapSemanticScholarType(paper.publicationTypes),
      doi: paper.externalIds?.DOI,
      url: paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : 
           paper.externalIds?.ArXiv ? `https://arxiv.org/abs/${paper.externalIds.ArXiv}` : undefined,
      journal: paper.venue,
      abstract: paper.abstract?.slice(0, 500),
      citationCount: paper.citationCount || 0,
      verified: !!(paper.externalIds?.DOI || paper.externalIds?.ArXiv),
      database: "Semantic Scholar",
      peerReviewed: paper.publicationTypes?.includes("JournalArticle"),
    }));
  } catch (error) {
    logStep("Semantic Scholar error", { error: String(error) });
    return [];
  }
}

function mapSemanticScholarType(types: string[]): AcademicSource['type'] {
  if (!types || types.length === 0) return 'article';
  if (types.includes("JournalArticle")) return 'journal';
  if (types.includes("Book")) return 'book';
  if (types.includes("Conference")) return 'conference';
  return 'article';
}

// Query arXiv for technical/scientific papers
async function queryArXiv(topic: string, category: string): Promise<AcademicSource[]> {
  const arxivCategories = ['science', 'technology', 'philosophy', 'economics'];
  if (!arxivCategories.includes(category)) {
    logStep("Skipping arXiv for category", { category });
    return [];
  }
  
  logStep("Querying arXiv", { topic: topic.slice(0, 50) });
  
  try {
    const searchQuery = encodeURIComponent(topic.replace(/[^\w\s]/g, ' '));
    const response = await fetch(
      `http://export.arxiv.org/api/query?search_query=all:${searchQuery}&start=0&max_results=10&sortBy=relevance&sortOrder=descending`
    );

    if (!response.ok) {
      logStep("arXiv error", { status: response.status });
      return [];
    }

    const xmlText = await response.text();
    const entries = xmlText.split('<entry>').slice(1);
    
    logStep("arXiv results", { count: entries.length });

    return entries.map((entry: string) => {
      const title = entry.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/\s+/g, ' ').trim() || "Untitled";
      const authors = (entry.match(/<name>([^<]*)<\/name>/g) || [])
        .map(m => m.replace(/<\/?name>/g, ''))
        .slice(0, 5);
      const published = entry.match(/<published>([^<]*)<\/published>/)?.[1];
      const arxivId = entry.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]*)<\/id>/)?.[1];
      const abstract = entry.match(/<summary>([^]*?)<\/summary>/)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 500);
      
      return {
        id: arxivId || `arxiv-${Date.now()}`,
        title,
        authors,
        year: published ? new Date(published).getFullYear() : new Date().getFullYear(),
        type: 'preprint' as const,
        doi: undefined,
        url: arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined,
        abstract,
        verified: !!arxivId,
        database: "arXiv",
        peerReviewed: false, // arXiv is preprint
      };
    });
  } catch (error) {
    logStep("arXiv error", { error: String(error) });
    return [];
  }
}

// Query PubMed for medical/health content
async function queryPubMed(topic: string, category: string): Promise<AcademicSource[]> {
  const pubmedCategories = ['medicine', 'science', 'theology']; // theology for ethics
  if (!pubmedCategories.includes(category)) {
    logStep("Skipping PubMed for category", { category });
    return [];
  }
  
  logStep("Querying PubMed", { topic: topic.slice(0, 50) });
  
  try {
    const searchQuery = encodeURIComponent(topic);
    // First, search for IDs
    const searchResponse = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchQuery}&retmax=10&retmode=json&sort=relevance`
    );

    if (!searchResponse.ok) {
      logStep("PubMed search error", { status: searchResponse.status });
      return [];
    }

    const searchData = await searchResponse.json();
    const ids = searchData.esearchresult?.idlist || [];
    
    if (ids.length === 0) {
      logStep("PubMed no results");
      return [];
    }

    // Then fetch details
    const detailsResponse = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`
    );

    if (!detailsResponse.ok) {
      logStep("PubMed details error", { status: detailsResponse.status });
      return [];
    }

    const detailsData = await detailsResponse.json();
    const results = detailsData.result || {};
    
    logStep("PubMed results", { count: ids.length });

    return ids.map((id: string) => {
      const article = results[id];
      if (!article) return null;
      
      return {
        id: `pubmed-${id}`,
        title: article.title || "Untitled",
        authors: (article.authors || []).slice(0, 5).map((a: any) => a.name || "Unknown"),
        year: article.pubdate ? parseInt(article.pubdate.split(' ')[0]) : new Date().getFullYear(),
        type: 'journal' as const,
        doi: article.elocationid?.replace("doi: ", ""),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        journal: article.source,
        verified: true,
        database: "PubMed",
        peerReviewed: true,
      };
    }).filter(Boolean) as AcademicSource[];
  } catch (error) {
    logStep("PubMed error", { error: String(error) });
    return [];
  }
}

// Enrich with Perplexity for additional context
async function enrichWithPerplexity(topic: string, sources: AcademicSource[]): Promise<AcademicSource[]> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  
  if (!PERPLEXITY_API_KEY || sources.length >= 10) {
    return sources;
  }
  
  logStep("Enriching with Perplexity");
  
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { 
            role: "system", 
            content: `You are an academic reference finder. Find additional scholarly sources for the topic. Return ONLY verified sources with DOIs when possible. Return as JSON array:
[{"title": "Full Title", "authors": ["Author Name"], "year": 2023, "doi": "10.xxx/xxx", "journal": "Journal Name", "type": "journal"}]`
          },
          { 
            role: "user", 
            content: `Find 5 additional peer-reviewed academic sources about: ${topic}. Must have DOIs.` 
          }
        ],
        search_mode: "academic",
      }),
    });

    if (!response.ok) {
      return sources;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const additionalSources = JSON.parse(jsonMatch[0]).map((s: any) => ({
          id: `perplexity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: s.title || "Unknown",
          authors: s.authors || ["Unknown"],
          year: s.year || new Date().getFullYear(),
          type: s.type || 'article',
          doi: s.doi,
          url: s.doi ? `https://doi.org/${s.doi}` : s.url,
          journal: s.journal,
          verified: !!s.doi,
          database: "Perplexity Academic",
          peerReviewed: !!s.doi,
        }));
        return [...sources, ...additionalSources];
      }
    } catch (e) {
      logStep("Perplexity parse error", { error: String(e) });
    }
    
    return sources;
  } catch (error) {
    logStep("Perplexity error", { error: String(error) });
    return sources;
  }
}

// Deduplicate sources by DOI and title similarity
function deduplicateSources(sources: AcademicSource[]): AcademicSource[] {
  const seen = new Map<string, AcademicSource>();
  
  for (const source of sources) {
    // Prefer sources with DOIs
    const key = source.doi || source.title.toLowerCase().slice(0, 50);
    const existing = seen.get(key);
    
    if (!existing || (source.verified && !existing.verified) || (source.citationCount || 0) > (existing.citationCount || 0)) {
      seen.set(key, source);
    }
  }
  
  return Array.from(seen.values());
}

// Calculate confidence score
function calculateConfidence(sources: AcademicSource[]): ResearchResult['metadata']['confidenceScore'] {
  const verifiedCount = sources.filter(s => s.verified).length;
  const peerReviewedCount = sources.filter(s => s.peerReviewed).length;
  
  if (verifiedCount >= 15 && peerReviewedCount >= 10) return 'high';
  if (verifiedCount >= 8 && peerReviewedCount >= 5) return 'moderate';
  if (verifiedCount >= 3) return 'low';
  return 'insufficient';
}

// Generate topic refinement suggestions
function generateRefinements(topic: string, sources: AcademicSource[]): string[] {
  if (sources.length >= 10) return [];
  
  const suggestions = [
    `Try a more specific aspect of "${topic}"`,
    `Include key researchers or authors in the field`,
    `Focus on a particular time period or methodology`,
    `Use technical terminology common in the field`,
  ];
  
  if (sources.length === 0) {
    suggestions.unshift(`The topic "${topic}" may be too niche or novel. Consider broader related concepts.`);
  }
  
  return suggestions.slice(0, 3);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      logStep("Auth error", { error: authError?.message });
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Authenticated user", { userId: user.id.slice(0, 8) + "..." });

    // Check user tier for Deep Research access
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roleData?.some(r => r.role === "admin");
    const userPlan = profile?.plan || "free";
    
    // Free users cannot use Deep Research for generation (but can view)
    if (userPlan === "free" && !isAdmin) {
      logStep("Free tier cannot use Deep Research for generation");
      // Still allow research but with notice
    }

    const { 
      topic, 
      category, 
      keyTopics = [],
      mode = 'full' // 'quick' | 'full' | 'exhaustive'
    } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Starting deep research", { topic: topic.slice(0, 100), category, mode });

    // Query all databases in parallel
    const searchTopic = keyTopics.length > 0 
      ? `${topic} ${keyTopics.slice(0, 3).join(' ')}`
      : topic;

    const [openAlexResults, crossRefResults, semanticScholarResults, arxivResults, pubmedResults] = 
      await Promise.all([
        queryOpenAlex(searchTopic, category),
        queryCrossRef(searchTopic),
        querySemanticScholar(searchTopic),
        queryArXiv(searchTopic, category),
        queryPubMed(searchTopic, category),
      ]);

    logStep("Database queries complete", {
      openAlex: openAlexResults.length,
      crossRef: crossRefResults.length,
      semanticScholar: semanticScholarResults.length,
      arxiv: arxivResults.length,
      pubmed: pubmedResults.length,
    });

    // Combine and deduplicate
    let allSources = [
      ...openAlexResults,
      ...crossRefResults,
      ...semanticScholarResults,
      ...arxivResults,
      ...pubmedResults,
    ];

    // Enrich with Perplexity if needed
    if (mode === 'exhaustive' || allSources.length < 10) {
      allSources = await enrichWithPerplexity(searchTopic, allSources);
    }

    // Deduplicate
    const uniqueSources = deduplicateSources(allSources);

    // Sort by verification and citation count
    uniqueSources.sort((a, b) => {
      if (a.verified !== b.verified) return b.verified ? 1 : -1;
      if (a.peerReviewed !== b.peerReviewed) return b.peerReviewed ? 1 : -1;
      return (b.citationCount || 0) - (a.citationCount || 0);
    });

    // Calculate metadata
    const databasesCovered = [...new Set(uniqueSources.map(s => s.database))];
    const verifiedCount = uniqueSources.filter(s => s.verified).length;
    const peerReviewedCount = uniqueSources.filter(s => s.peerReviewed).length;
    const confidenceScore = calculateConfidence(uniqueSources);
    const topicCoverage = Math.min(100, Math.round((uniqueSources.length / 20) * 100));

    const result: ResearchResult = {
      sources: uniqueSources.slice(0, 30), // Max 30 sources
      metadata: {
        totalSources: uniqueSources.length,
        verifiedSources: verifiedCount,
        peerReviewedSources: peerReviewedCount,
        databasesCovered,
        researchDate: new Date().toISOString(),
        confidenceScore,
        topicCoverage,
      },
      suggestedRefinements: generateRefinements(topic, uniqueSources),
    };

    logStep("Research complete", {
      total: result.metadata.totalSources,
      verified: result.metadata.verifiedSources,
      confidence: result.metadata.confidenceScore,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        sources: [],
        metadata: {
          totalSources: 0,
          verifiedSources: 0,
          peerReviewedSources: 0,
          databasesCovered: [],
          researchDate: new Date().toISOString(),
          confidenceScore: 'insufficient' as const,
          topicCoverage: 0,
        },
        suggestedRefinements: ["Research failed. Please try a different topic or check your connection."],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
