# Image Chat Frontend

This is the frontend of [ImageChat](https://github.com/qstommyshu/image-chat), for the full feature, please checkout the backend.

## Project Overview

This application crawls websites to extract and index images, then allows users to search and interact with the discovered images through a conversational AI interface. The frontend dynamically converts image URLs to HTMLImageElement components for seamless display with lazy loading and error handling.

## Key Features

- **Website Crawling**: Input any website URL to crawl and extract images
- **Real-time Status Updates**: Live crawling progress via Server-Sent Events (SSE)
- **AI Chat Interface**: Natural language search for discovered images
- **Dynamic Image Rendering**: URLs are dynamically converted to HTMLImageElement with:
  - Lazy loading for performance optimization
  - Error handling with fallback placeholders
  - Click-to-expand functionality
- **Session Management**: Persistent crawl sessions with unique identifiers
- **Image Metadata**: Display of image format, source page, and relevance scores

## Architecture

### Frontend (React TypeScript)

- **Main Component**: `src/components/ChatInterface.tsx`
- **Image Rendering**: Dynamic conversion of image URLs to HTML `<img>` elements
- **Real-time Updates**: EventSource API for live crawling status
- **Error Handling**: Graceful fallback for broken image URLs

### Backend API Integration

- **Base URL**: `http://127.0.0.1:5001/` (configurable)
- **Endpoints**:
  - `POST /crawl` - Initiate website crawling
  - `GET /crawl/{session_id}/status` - Real-time status updates (SSE)
  - `POST /chat` - AI-powered image search
  - `GET /health` - API health check

### Image Display Implementation

```typescript
// Dynamic image loading with error handling
<img
  src={result.url}
  alt={result.alt_text}
  loading="lazy"
  onError={(e) => {
    // Hide broken image and show fallback
    const target = e.target as HTMLImageElement;
    target.style.display = "none";
    // Show fallback placeholder
  }}
/>
```

**Backend Setup**
Check it out [here](https://github.com/qstommyshu/image-chat)

## Technologies Used

### Tech Stack

- **Vite** - Build tool and development server
- **TypeScript** - Type-safe JavaScript
- **React** - UI framework with hooks (useState, useEffect, useRef)
- **shadcn-ui** - Modern UI component library
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library

### Key React Features

- **EventSource API** - Real-time server-sent events
- **Dynamic Image Loading** - URL to HTMLImageElement conversion
- **Error Boundaries** - Graceful image loading failures
- **Lazy Loading** - Performance optimization for images

### API Communication

- **Fetch API** - HTTP requests to backend
- **Server-Sent Events** - Real-time crawling updates
- **Session Management** - Persistent crawl sessions

## Development Features

- **Real-time Status Updates**: Live feedback during website crawling
- **Responsive Design**: Works on desktop and mobile devices
- **Error Handling**: Comprehensive error states and fallbacks
- **Performance Optimized**: Lazy loading and efficient re-renders
- **Type Safety**: Full TypeScript implementation
