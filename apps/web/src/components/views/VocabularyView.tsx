import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Word } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function VocabularyView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: words, isLoading } = useQuery({
    queryKey: [
      "words",
      { status: statusFilter !== "all" ? statusFilter : undefined, q: search },
    ],
    queryFn: () =>
      api.getWords({
        status: statusFilter !== "all" ? statusFilter : undefined,
        q: search || undefined,
        limit: 100,
      }),
  });

  const groupedByLevel = words?.reduce(
    (acc, word) => {
      const level = word.cefrLevel;
      if (!acc[level]) acc[level] = [];
      acc[level].push(word);
      return acc;
    },
    {} as Record<string, typeof words>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vocabulary</h1>
        <p className="text-muted-foreground mt-1">
          Browse and search your Hindi vocabulary
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search words..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Tabs
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-full sm:w-auto"
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="KNOWN">Known</TabsTrigger>
            <TabsTrigger value="LEARNING">Learning</TabsTrigger>
            <TabsTrigger value="NEW">New</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : !words || words.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No words found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(["A1", "A2", "B1", "B2"] as const).map((level) => {
            const levelWords = groupedByLevel?.[level];
            if (!levelWords || levelWords.length === 0) return null;

            return (
              <div key={level}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      level === "A1" && "bg-green-100 text-green-800",
                      level === "A2" && "bg-blue-100 text-blue-800",
                      level === "B1" && "bg-yellow-100 text-yellow-800",
                      level === "B2" && "bg-red-100 text-red-800",
                    )}
                  >
                    {level}
                  </span>
                  <span className="text-muted-foreground font-normal">
                    ({levelWords.length} words)
                  </span>
                </h2>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {levelWords.map((word) => (
                    <WordCard key={word.id} word={word} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WordCard({ word }: { word: Word }) {
  const status = word.userProgress?.status || "NEW";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="hindi-text text-xl">{word.hindi}</div>
            <div className="text-sm text-muted-foreground">
              {word.romanized}
            </div>
          </div>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded",
              status === "KNOWN" && "bg-green-100 text-green-800",
              status === "MASTERED" && "bg-purple-100 text-purple-800",
              status === "LEARNING" && "bg-blue-100 text-blue-800",
              status === "NEW" && "bg-gray-100 text-gray-800",
            )}
          >
            {status}
          </span>
        </div>
        <div className="mt-2 font-medium">{word.english}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {word.partOfSpeech}
        </div>
        {word.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {word.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs bg-accent px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
