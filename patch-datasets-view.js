const fs = require('fs');
let file_path = 'src/components/views/datasets-view.tsx';
let content = fs.readFileSync(file_path, 'utf8');

// The standalone Share button
const shareOld = `<Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Share dataset"
                            onClick={() => handleShare(d)}
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>`;

const shareNew = `{d.accessLevel === "read" || d.accessLevel === "comment" ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50" disabled aria-label="Share dataset">
                                    <Share2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>You must be an editor to share this dataset.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Share dataset" onClick={() => handleShare(d)}>
                            <Share2 className="h-4 w-4" />
                          </Button>
                        )}`;

content = content.replace(shareOld, shareNew);

// The Dropdown menu items
const dropOld = `<DropdownMenuItem onClick={() => setAssignSchemaTarget(d)}>
                                <FileCode2 className="mr-2 h-4 w-4" />
                                {d.schema ? "Change Schema" : "Assign Schema"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setSheetsPanelDataset(d)}>
                                <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
                                Google Sheets
                              </DropdownMenuItem>`;
                              
const dropNew = `{d.accessLevel !== "read" && d.accessLevel !== "comment" && (
                                <>
                                  <DropdownMenuItem onClick={() => setAssignSchemaTarget(d)}>
                                    <FileCode2 className="mr-2 h-4 w-4" />
                                    {d.schema ? "Change Schema" : "Assign Schema"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSheetsPanelDataset(d)}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
                                    Google Sheets
                                  </DropdownMenuItem>
                                </>
                              )}`;

content = content.replace(dropOld, dropNew);

// The Dropdown Share and Delete
const shareDeleteOld = `<DropdownMenuItem onClick={() => handleShare(d)}>
                                <Share2 className="mr-2 h-4 w-4" />
                                Share
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(d)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>`;

const shareDeleteNew = `{d.accessLevel !== "read" && d.accessLevel !== "comment" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleShare(d)}>
                                    <Share2 className="mr-2 h-4 w-4" />
                                    Share
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(d)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}`;

content = content.replace(shareDeleteOld, shareDeleteNew);

fs.writeFileSync(file_path, content);
console.log('Patched datasets-view.tsx');
