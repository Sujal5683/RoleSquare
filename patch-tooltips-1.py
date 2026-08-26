import os
import re

file_path = 'src/components/views/dataset-detail-view.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Ensure Tooltip is imported
if 'import { Tooltip,' not in content and 'import { TooltipProvider' not in content:
    content = content.replace(
        'import { AssignSchemaDialog } from "@/components/datasets/assign-schema-dialog";',
        'import { AssignSchemaDialog } from "@/components/datasets/assign-schema-dialog";\nimport { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";'
    )

# Fix Share button in DetailTopBar
share_old = '''        {cannotEdit ? (
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
share_new = '''        {cannotEdit ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button variant="outline" size="sm" disabled>
                    <Share2 className="mr-2 h-3.5 w-3.5" />
                    Share
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>You must be an editor to share this dataset.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onShare?.()}>
            <Share2 className="mr-2 h-3.5 w-3.5" />
            Share
          </Button>
        )}'''
content = content.replace(share_old, share_new)

# Fix Connect Sheets button
connect_old = '''              {/* Connect Sheets */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSheetsPanelOpen(true)}
                title="Connect to Google Sheets"
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                Connect Sheets
              </Button>'''
connect_new = '''              {/* Connect Sheets */}
              {cannotEdit ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button variant="outline" size="sm" disabled className="opacity-50">
                          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                          Connect Sheets
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>You must be an editor to connect sheets.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSheetsPanelOpen(true)}
                  title="Connect to Google Sheets"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  Connect Sheets
                </Button>
              )}'''
content = content.replace(connect_old, connect_new)

# Fix Extract Custom Fields (AI)
extract_old = '''              {/* AI Extract — primary action when available */}
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
              )}'''
extract_new = '''              {/* AI Extract — primary action when available */}
              {dataset?.isDefault && dataset.sourceId && (
                cannotEdit ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button size="sm" className="gap-1.5 bg-gradient-to-r from-violet-600/50 to-indigo-600/50 text-white/70 shadow-sm" disabled>
                            <Zap className="h-3.5 w-3.5" />
                            Extract Custom Fields (AI)
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>You must be an editor to extract custom fields.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
content = content.replace(extract_old, extract_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated dataset-detail-view.tsx")
