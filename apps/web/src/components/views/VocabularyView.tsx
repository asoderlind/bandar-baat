import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Word } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn, getGenderClass } from "@/lib/utils";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

const columnHelper = createColumnHelper<Word>();

function formatReviewDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) return "Due now";
  if (diffMins < 60) return `In ${diffMins}m`;
  if (diffHours < 24) return `In ${diffHours}h`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays} days`;
  return date.toLocaleDateString();
}

const columns = [
  columnHelper.accessor("hindi", {
    header: "Hindi",
    cell: (info) => (
      <span
        className={cn(
          "hindi-text text-lg",
          getGenderClass(info.row.original.partOfSpeech, info.row.original.gender),
        )}
      >
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("romanized", {
    header: "Romanized",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("english", {
    header: "English",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor("partOfSpeech", {
    header: "Part of Speech",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor((row) => row.userProgress?.status ?? "NEW", {
    id: "status",
    header: "Status",
    cell: (info) => {
      const status = info.getValue();
      return (
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
      );
    },
  }),
  columnHelper.accessor((row) => row.userProgress?.nextReviewAt ?? null, {
    id: "nextReview",
    header: "Next Review",
    cell: (info) => {
      const val = info.getValue();
      if (!val) return <span className="text-muted-foreground">—</span>;
      return (
        <span
          className={cn(
            "text-xs",
            new Date(val) <= new Date()
              ? "text-orange-600 font-medium"
              : "text-muted-foreground",
          )}
        >
          {formatReviewDate(val)}
        </span>
      );
    },
  }),
];

export function VocabularyView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data: words, isLoading } = useQuery({
    queryKey: ["words"],
    queryFn: () => api.getWords({ limit: 5000 }),
  });

  const filteredWords = useMemo(() => {
    if (!words) return [];
    let result = words;
    if (statusFilter !== "all") {
      result = result.filter(
        (w) => (w.userProgress?.status ?? "NEW") === statusFilter,
      );
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (w) =>
          w.hindi.toLowerCase().includes(q) ||
          w.romanized.toLowerCase().includes(q) ||
          w.english.toLowerCase().includes(q),
      );
    }
    return result;
  }, [words, statusFilter, search]);

  const table = useReactTable({
    data: filteredWords,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

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
      ) : filteredWords.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No words found</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {filteredWords.length} words
          </p>

          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b bg-muted/50">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="h-10 px-4 text-left align-middle font-medium text-muted-foreground"
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={cn(
                              "flex items-center gap-1",
                              header.column.getCanSort() &&
                                "cursor-pointer select-none hover:text-foreground",
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getCanSort() &&
                              (header.column.getIsSorted() === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-40" />
                              ))}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/30 transition-colors",
                      i % 2 === 0 ? "bg-background" : "bg-muted/10",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
