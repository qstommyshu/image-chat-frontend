import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, Globe, Loader2 } from "lucide-react";

// API base URL - can be easily changed for different environments
const API_BASE_URL = "https://chat-image-qstommyshu.replit.app/";

// Helper function to build API URLs correctly
const buildApiUrl = (path: string) => {
  // Ensure there's a single slash between base URL and path
  const baseWithoutTrailingSlash = API_BASE_URL.endsWith("/")
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL;

  const pathWithLeadingSlash = path.startsWith("/") ? path : `/${path}`;

  return `${baseWithoutTrailingSlash}${pathWithLeadingSlash}`;
};

interface Message {
  id: string;
  role: "ai" | "human";
  content: string;
  timestamp: Date;
  search_results?: SearchResult[];
}

interface SearchResult {
  url: string;
  format: string;
  alt_text: string;
  source_url: string;
  score: number;
}

interface CrawlStatus {
  type: "connected" | "status" | "progress" | "completed" | "error";
  data?: {
    status?: string;
    message?: string;
    summary?: string;
    total_images?: number;
    total_pages?: number;
    stats?: {
      formats: Record<string, number>;
      pages: Record<string, number>;
    };
  };
  session_id?: string;
}

export const ChatInterface = () => {
  const [url, setUrl] = useState("");
  const [limit, setLimit] = useState(10);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isCrawling, setIsCrawling] = useState(false);
  const [isCrawled, setIsCrawled] = useState(false);
  const [crawlStatus, setCrawlStatus] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Test connection to API on mount
  useEffect(() => {
    const testApiConnection = async () => {
      try {
        // First, check the health endpoint
        const healthUrl = buildApiUrl("health");
        console.log("Testing API connection:", healthUrl);

        const healthResponse = await fetch(healthUrl);
        const healthData = await healthResponse.json();

        console.log("API health check successful:", healthData);

        // Then check the sessions endpoint
        const sessionsUrl = buildApiUrl("sessions");
        console.log("Testing sessions endpoint:", sessionsUrl);

        const sessionsResponse = await fetch(sessionsUrl);
        const sessionsData = await sessionsResponse.json();

        console.log("Sessions endpoint successful:", sessionsData);

        toast({
          title: "Server Connected",
          description: `Connected to API server (${healthData.version}) with ${sessionsData.sessions.length} active sessions`,
        });
      } catch (error) {
        console.error("API connection failed:", error);
        toast({
          title: "Server Connection Failed",
          description:
            "Could not connect to API server. Check console for details.",
          variant: "destructive",
        });
      }
    };

    testApiConnection();
  }, [toast]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const subscribeToStatus = (sessionId: string) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const statusUrl = buildApiUrl(`crawl/${sessionId}/status`);
    console.log("Subscribing to status updates:", statusUrl);

    try {
      // Create and configure EventSource
      const eventSource = new EventSource(statusUrl, {
        withCredentials: false, // Don't send cookies with the request
      });

      // Set a timeout to detect initial connection issues
      const timeoutId = setTimeout(() => {
        if (eventSourceRef.current) {
          console.warn("EventSource connection timeout - closing connection");
          eventSourceRef.current.close();
          setIsCrawling(false);
          setCrawlStatus(
            "❌ Connection timeout: Server did not respond within 30 seconds"
          );
          toast({
            title: "Connection Timeout",
            description:
              "The server did not respond to the status connection. Try again or check if the server is running.",
            variant: "destructive",
          });
        }
      }, 60000); // 60 second timeout

      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("EventSource connection opened");
        clearTimeout(timeoutId); // Clear the timeout on successful connection
        setCrawlStatus("📡 Connection established with server");
      };

      eventSource.onmessage = (event) => {
        console.log("EventSource message received:", event.data);
        try {
          const data: CrawlStatus = JSON.parse(event.data);
          handleStatusUpdate(data);
        } catch (error) {
          console.error("Error parsing SSE message:", error, event.data);
          setCrawlStatus(`⚠️ Error parsing server message: ${error.message}`);
        }
      };

      eventSource.onerror = (error) => {
        console.error("EventSource error:", error);
        clearTimeout(timeoutId); // Clear the timeout on error
        eventSource.close();
        setIsCrawling(false);
        setCrawlStatus(`❌ Connection error: Failed to connect to server`);
        toast({
          title: "Connection Error",
          description:
            "Lost connection to server during crawling. The server might be down or experiencing issues.",
          variant: "destructive",
        });
      };
    } catch (error) {
      console.error("Error setting up EventSource:", error);
      setIsCrawling(false);
      setCrawlStatus(`❌ Failed to set up event source: ${error.message}`);
      toast({
        title: "Connection Error",
        description: `Failed to set up connection to server: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleStatusUpdate = (data: CrawlStatus) => {
    switch (data.type) {
      case "connected":
        setCrawlStatus("📡 Connected to status updates");
        break;

      case "status":
        setCrawlStatus(`📊 Status: ${data.data?.message}`);
        break;

      case "progress":
        setCrawlStatus(`⚡ ${data.data?.message}`);
        break;

      case "completed":
        setCrawlStatus(
          `✅ Crawling completed! Found ${data.data?.total_images} images across ${data.data?.total_pages} pages`
        );
        setIsCrawled(true);
        setIsCrawling(false);

        // Initialize chat with the summary
        if (data.data?.summary) {
          const systemMessage: Message = {
            id: Date.now().toString(),
            role: "ai",
            content: data.data.summary,
            timestamp: new Date(),
          };
          setMessages([systemMessage]);
        }

        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        toast({
          title: "Success",
          description:
            "Website crawled successfully! You can now start chatting.",
        });
        break;

      case "error":
        setCrawlStatus(`❌ Error: ${data.data?.message}`);
        setIsCrawling(false);

        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        toast({
          title: "Crawling Error",
          description: data.data?.message || "Unknown error occurred",
          variant: "destructive",
        });
        break;
    }
  };

  const handleCrawl = async () => {
    if (!url.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    // Validate the limit range
    if (limit < 1 || limit > 100) {
      toast({
        title: "Error",
        description: "Please enter a valid number of pages to crawl (1-100)",
        variant: "destructive",
      });
      return;
    }

    setIsCrawling(true);
    setCrawlStatus("🚀 Starting crawl...");

    try {
      console.log("Starting crawl for URL:", url, "with limit:", limit);
      const crawlUrl = buildApiUrl("crawl");
      console.log("API URL:", crawlUrl);

      // More robust approach for POST request
      const response = await fetch(crawlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        credentials: "omit", // Don't send cookies
        mode: "cors", // Explicitly set CORS mode
        body: JSON.stringify({ url, limit }),
      });

      // Check if we got a response at all
      if (!response) {
        throw new Error("No response received from server");
      }

      // Log all response headers for debugging
      console.log(
        "Response headers:",
        [...response.headers.entries()].reduce((obj, [key, val]) => {
          obj[key] = val;
          return obj;
        }, {})
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP error! status: ${response.status}`, errorText);
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }

      const result = await response.json();
      console.log("Crawl response:", result);

      setSessionId(result.session_id);

      // Add a small delay before connecting to SSE to ensure server has initialized the session
      setTimeout(() => {
        subscribeToStatus(result.session_id);
      }, 500);
    } catch (error) {
      console.error("Error starting crawl:", error);
      setIsCrawling(false);
      toast({
        title: "Error",
        description: `Failed to start crawling: ${error.message}. Please check the URL and try again.`,
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !sessionId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "human",
      content: currentMessage,
      timestamp: new Date(),
    };

    // Build chat history for API
    const chatHistory = [...messages, userMessage].map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setCurrentMessage("");
    setIsSending(true);

    try {
      console.log("Sending chat message:", currentMessage);
      const chatUrl = buildApiUrl("chat");
      console.log("Chat API URL:", chatUrl);

      // More robust approach for POST request
      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        credentials: "omit", // Don't send cookies
        mode: "cors", // Explicitly set CORS mode
        body: JSON.stringify({
          session_id: sessionId,
          chat_history: chatHistory,
        }),
      });

      // Log all response headers for debugging
      console.log(
        "Response headers:",
        [...response.headers.entries()].reduce((obj, [key, val]) => {
          obj[key] = val;
          return obj;
        }, {})
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP error! status: ${response.status}`, errorText);
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }

      const result = await response.json();
      console.log("Chat response:", result);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: result.response || "I received your message.",
        timestamp: new Date(),
        search_results: result.search_results,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);

      toast({
        title: "Error",
        description: `Failed to send message: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isCrawled && !isSending) {
        handleSendMessage();
      } else if (!isCrawled && !isCrawling) {
        handleCrawl();
      }
    }
  };

  const renderSearchResults = (results: SearchResult[]) => {
    if (!results || results.length === 0) return null;

    return (
      <div className="mt-3 space-y-3">
        <div className="text-xs text-gray-500 font-medium">Search Results:</div>
        {results.map((result, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-3 text-xs">
            <div className="flex gap-3">
              {/* Image Thumbnail */}
              <div className="flex-shrink-0">
                <img
                  src={result.url}
                  alt={result.alt_text}
                  className="w-20 h-20 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                  loading="lazy"
                  onClick={() => window.open(result.url, "_blank")}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                {/* Fallback for broken images */}
                <div
                  className="w-20 h-20 bg-gray-200 rounded border border-gray-200 items-center justify-center text-gray-400 hidden"
                  style={{ display: "none" }}
                >
                  <div className="text-center">
                    <div className="text-xs">🖼️</div>
                    <div className="text-xs">Image</div>
                  </div>
                </div>
              </div>

              {/* Image Details */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 mb-1 break-words">
                  {result.alt_text}
                </div>
                <div className="space-y-1">
                  <div className="text-gray-600">
                    <span className="font-medium">Format:</span>{" "}
                    {result.format.toUpperCase()}
                  </div>
                  <div className="text-gray-600">
                    <span className="font-medium">Score:</span>{" "}
                    {result.score.toFixed(4)}
                  </div>
                  <div className="space-x-2 mt-2">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center"
                    >
                      <span>🔗 View Full Image</span>
                    </a>
                    <a
                      href={result.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center"
                    >
                      <span>📄 Source Page</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const resetCrawl = () => {
    setUrl("");
    setLimit(10);
    setSessionId(null);
    setIsCrawling(false);
    setIsCrawled(false);
    setCrawlStatus("");
    setMessages([]);
    setCurrentMessage("");
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 p-4 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Image Chat</h1>

          {/* URL Input Section */}
          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1 relative">
              <label
                htmlFor="url-input"
                className="block text-xs text-gray-600 mb-1"
              >
                Website URL
              </label>
              <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                id="url-input"
                type="url"
                placeholder="Enter website URL to crawl..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isCrawling || isCrawled}
                className="pl-10 bg-white/70 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col">
              <label
                htmlFor="pages-limit"
                className="text-xs text-gray-600 mb-1"
              >
                Pages to crawl(Max: 20)
              </label>
              <Input
                id="pages-limit"
                type="number"
                placeholder="Pages"
                value={limit}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 10;
                  // Enforce the 1-20 range
                  setLimit(Math.min(Math.max(value, 1), 20));
                }}
                disabled={isCrawling || isCrawled}
                className="w-24 bg-white/70 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                min="1"
                max="100"
              />
            </div>
            <Button
              onClick={handleCrawl}
              disabled={isCrawling || isCrawled || !url.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              {isCrawling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Crawling...
                </>
              ) : isCrawled ? (
                "Crawled ✓"
              ) : (
                "Crawl Site"
              )}
            </Button>
            {isCrawled && (
              <Button onClick={resetCrawl} variant="outline" className="px-4">
                Reset
              </Button>
            )}
          </div>

          {/* Status Display */}
          {crawlStatus && (
            <div className="text-sm text-gray-600 bg-gray-50 rounded p-2 mb-2">
              {crawlStatus}
              {sessionId && (
                <div className="mt-1 text-xs text-blue-600">
                  Session ID: <span className="font-mono">{sessionId}</span>
                </div>
              )}
            </div>
          )}

          {isCrawled && (
            <div className="text-sm text-green-600 bg-green-50 rounded p-2">
              ✓ Successfully crawled {url} - Ready to chat!
              {sessionId && (
                <div className="mt-1 text-xs text-green-700">
                  Session ID: <span className="font-mono">{sessionId}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 max-w-4xl mx-auto w-full p-4">
        <Card className="h-full bg-white/70 backdrop-blur-sm border-gray-200 shadow-lg">
          <CardContent className="p-0 h-full flex flex-col">
            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 && !isCrawled && !isCrawling && (
                <div className="text-center text-gray-500 mt-8">
                  <Globe className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">
                    Enter a website URL above to get started
                  </p>
                  <p className="text-sm">
                    I'll crawl the site and then you can search for images using
                    natural language
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-4 flex ${
                    message.role === "human" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.role === "human"
                        ? "bg-blue-600 text-white ml-4"
                        : "bg-gray-100 text-gray-900 mr-4"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.search_results &&
                      renderSearchResults(message.search_results)}
                    <span className="text-xs opacity-70 mt-1 block">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex justify-start mb-4">
                  <div className="bg-gray-100 text-gray-900 p-3 rounded-lg mr-4">
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </ScrollArea>

            {/* Input Area */}
            {isCrawled && (
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-3">
                  <Input
                    placeholder="Search for images using natural language..."
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isSending}
                    className="bg-white/70 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={isSending || !currentMessage.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
