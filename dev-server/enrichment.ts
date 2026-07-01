type MovieEnrichmentResult = {
  title: string;
  year?: string;
  director?: string;
  genre?: string;
  actors?: string;
  plot?: string;
  poster?: string;
  imdbRating?: string;
  country?: string;
  wikiExtract?: string;
  _notFound?: boolean;
  _error?: string;
};

type WikiSearchResponse = {
  query?: {
    search?: Array<{ pageid?: number | string }>;
  };
};

type WikiExtractResponse = {
  query?: {
    pages?: Record<string, { extract?: string }>;
  };
};

type TmdbSearchResponse = {
  results?: Array<{ id?: number | string }>;
};

type TmdbMovieDetails = {
  title?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string;
  vote_average?: number;
  genres?: Array<{ name?: string }>;
  production_countries?: Array<{ iso_3166_1?: string }>;
  credits?: {
    crew?: Array<{ job?: string; name?: string }>;
    cast?: Array<{ name?: string }>;
  };
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchWikiExtract(title: string, year?: string): Promise<string | undefined> {
  try {
    const searchQuery = encodeURIComponent(`${title} ${year ? year : ''} película`.trim());
    const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&utf8=&format=json&origin=*`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json() as WikiSearchResponse;
    
    if (searchData.query?.search && searchData.query.search.length > 0) {
      // Get the top matching page ID
      const pageId = searchData.query.search[0].pageid;
      if (pageId === undefined) return undefined;
      
      const extractUrl = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=false&explaintext=true&pageids=${pageId}&format=json&origin=*`;
      const extractRes = await fetch(extractUrl);
      const extractData = await extractRes.json() as WikiExtractResponse;
      
      const text = extractData.query?.pages?.[String(pageId)]?.extract;
      if (text) {
        // Limit to ~2000 chars to avoid blowing up the prompt token count
        return text.length > 2000 ? text.substring(0, 2000) + '...' : text;
      }
    }
  } catch (error: unknown) {
    console.error(`  ❌ Wiki error for "${title}": ${getErrorMessage(error)}`);
  }
  return undefined;
}

/** Enrich movie titles via TMDB API and Wikipedia */
export async function enrichMovieData(titles: string[], apiKey: string): Promise<MovieEnrichmentResult[]> {
  const results: MovieEnrichmentResult[] = [];

  for (const title of titles) {
    try {
      console.log(`🎬 TMDB lookup: "${title.trim()}"`);
      // Step 1: Search movie
      const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title.trim())}&language=es&api_key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json() as TmdbSearchResponse;

      if (searchData.results && searchData.results.length > 0) {
        const topMatch = searchData.results[0];
        if (topMatch.id === undefined) {
          results.push({ title: title.trim(), _notFound: true });
          continue;
        }
        
        // Step 2: Grab full details (for credits)
        const detailsUrl = `https://api.themoviedb.org/3/movie/${topMatch.id}?append_to_response=credits&language=es&api_key=${apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json() as TmdbMovieDetails;

        const director = detailsData.credits?.crew?.find((crewMember) => crewMember.job === 'Director')?.name;
        const actors = detailsData.credits?.cast?.slice(0, 3).map((actor) => actor.name).filter(Boolean).join(', ');
        const year = detailsData.release_date ? detailsData.release_date.split('-')[0] : undefined;

        // Step 3: Fetch Wikipedia extract for deep lore
        let wikiExtract = undefined;
        if (detailsData.title) {
           console.log(`  📚 Wikipedia lookup for lore...`);
           wikiExtract = await fetchWikiExtract(detailsData.title, year);
        }

        results.push({
          title: detailsData.title ?? title.trim(),
          year,
          director,
          genre: detailsData.genres?.map((genre) => genre.name).filter(Boolean).join(', '),
          actors,
          plot: detailsData.overview,
          poster: detailsData.poster_path ? `https://image.tmdb.org/t/p/w500${detailsData.poster_path}` : undefined,
          imdbRating: detailsData.vote_average ? detailsData.vote_average.toFixed(1) : undefined,
          country: detailsData.production_countries?.map((country) => country.iso_3166_1).filter(Boolean).join(', '),
          wikiExtract,
        });
        console.log(`  ✅ Found: ${detailsData.title} (${year}) — ⭐ ${detailsData.vote_average?.toFixed(1)}${wikiExtract ? ' [+Wiki Lore]' : ''}`);
      } else {
        console.log(`  ⚠️ Not found: "${title}"`);
        results.push({ title: title.trim(), _notFound: true });
      }

      // Rate limit TMDB (40 req per 10s -> ~250ms per req safety)
      await new Promise(r => setTimeout(r, 250));
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      console.error(`  ❌ TMDB error for "${title}": ${message}`);
      results.push({ title: title.trim(), _error: message });
    }
  }

  return results;
}
