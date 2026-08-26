import os

f = 'src/components/views/dataset-detail-view.tsx'
with open(f, 'r', encoding='utf8') as file:
    content = file.read()

# 1. Add cannotEdit to DetailTopBar props
content = content.replace(
'''  exporting: boolean;
  onShare?: () => void;
  onAssignSchema?: () => void;
}) {''',
'''  exporting: boolean;
  onShare?: () => void;
  onAssignSchema?: () => void;
  cannotEdit?: boolean;
}) {'''
)

# 2. Add cannotEdit when calling DetailTopBar
content = content.replace(
'''      <DetailTopBar
        dataset={dataset}
        onBack={() => setView("datasets")}
        onRefresh={() => refetchRecords()}
        refreshing={recordsFetching}
        onExport={(f) => exportMutation.mutate({ format: f })}
        exporting={exportMutation.isPending}
        onShare={() => setShareOpen(true)}
        onAssignSchema={() => setAssignSchemaOpen(true)}
      />''',
'''      <DetailTopBar
        dataset={dataset}
        onBack={() => setView("datasets")}
        onRefresh={() => refetchRecords()}
        refreshing={recordsFetching}
        onExport={(f) => exportMutation.mutate({ format: f })}
        exporting={exportMutation.isPending}
        onShare={() => setShareOpen(true)}
        onAssignSchema={() => setAssignSchemaOpen(true)}
        cannotEdit={cannotEdit}
      />'''
)

# 3. Disable Share button
content = content.replace(
'''        <Button
          variant="outline"
          size="sm"
          onClick={() => onShare?.()}
        >
          <Share2 className="mr-2 h-3.5 w-3.5" />
          Share
        </Button>''',
'''        {cannotEdit ? (
          <div title="You must be an editor to share this dataset.">
            <Button variant="outline" size="sm" disabled>
              <Share2 className="mr-2 h-3.5 w-3.5" />
              Share
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onShare?.()}>
            <Share2 className="mr-2 h-3.5 w-3.5" />
            Share
          </Button>
        )}'''
)

# 4. Hide Assign Schema if cannotEdit
content = content.replace(
'''        {/* Three-dot actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onAssignSchema?.()}>
              <FileCode2 className="mr-2 h-4 w-4" />
              {dataset?.schema ? "Change Schema" : "Assign Schema"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>''',
'''        {/* Three-dot actions menu */}
        {!cannotEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onAssignSchema?.()}>
                <FileCode2 className="mr-2 h-4 w-4" />
                {dataset?.schema ? "Change Schema" : "Assign Schema"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}'''
)

# 5. Disable Connect Sheets and AI Extract
content = content.replace(
'''              {/* Connect Sheets */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setSheetsPanelOpen(true)}
                title="Connect to Google Sheets"
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                Connect Sheets
              </Button>

              {/* AI Extract — primary action when available */}
              {dataset?.isDefault && dataset.sourceId && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-sm"
                  onClick={() => setExtractDialog(true)}
                  title="Run AI extraction from this Default Dataset into a new Custom Dataset"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Extract Custom Fields (AI)
                </Button>
              )}''',
'''              {/* Connect Sheets */}
              {cannotEdit ? (
                <div title="You must be an editor to connect sheets.">
                  <Button variant="outline" size="sm" className="gap-1.5" disabled>
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                    Connect Sheets
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setSheetsPanelOpen(true)}
                  title="Connect to Google Sheets"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  Connect Sheets
                </Button>
              )}

              {/* AI Extract — primary action when available */}
              {dataset?.isDefault && dataset.sourceId && (
                cannotEdit ? (
                  <div title="You must be an editor to extract custom fields.">
                    <Button size="sm" className="gap-1.5 bg-gradient-to-r from-violet-600/50 to-indigo-600/50 text-white/70 shadow-sm" disabled>
                      <Zap className="h-3.5 w-3.5" />
                      Extract Custom Fields (AI)
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-sm"
                    onClick={() => setExtractDialog(true)}
                    title="Run AI extraction from this Default Dataset into a new Custom Dataset"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Extract Custom Fields (AI)
                  </Button>
                )
              )}'''
)

with open(f, 'w', encoding='utf8') as file:
    file.write(content)
print('Patched dataset-detail-view.tsx')
