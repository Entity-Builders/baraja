# Baraja.cards

Baraja is an application to generate, manage, and print custom card decks for various types of games (trivia, introspection, party games, etc.).

## External APIs

This project utilizes the following external APIs for data enrichment and generation:

### The Movie Database (TMDB) API

We use the TMDB API to fetch verified and localized metadata for movies, TV shows, and actors. This data is fed into our AI generation pipeline to ensure accurate trivia questions and prevent AI hallucinations, especially in entertainment-focused decks.

*   **Configuration & Documentation:** [TMDB API Settings](https://www.themoviedb.org/settings/api)

---

## Development Setup

This project is built using:
- React + TypeScript
- Vite
- Tailwind CSS

To run the application locally:
```bash
yarn workspace baraja dev
```
