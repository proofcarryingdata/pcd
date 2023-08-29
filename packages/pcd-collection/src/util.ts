import _ from "lodash";

export function getFoldersInFolder(
  folderPath: string,
  allPaths: string[]
): string[] {
  console.log("folderPath", folderPath);

  const descendantsOfFolder = _.uniq(
    allPaths.filter((p) => isFolderAncestor(p, folderPath))
  );

  console.log("descendantsOfFolder", descendantsOfFolder);

  const descendantsWithMissing = _.uniq([
    ...descendantsOfFolder.flatMap((path) => getAllAncestors(path)),
    ...descendantsOfFolder
  ]).filter((a) => a !== "");

  console.log("descendantsWithMissing", descendantsWithMissing);

  const directDescendants = descendantsWithMissing.filter((d) =>
    isDirectDescendant(folderPath, d)
  );

  console.log("directDescendants", directDescendants);

  return directDescendants;
}

export function getAllAncestors(path: string): string[] {
  const parts = splitPath(path);
  const result = [];

  while (parts.length > 0) {
    parts.pop();
    result.push(parts.join("/"));
  }

  return result;
}

export function isDirectDescendant(path: string, descendant: string) {
  const normalizedPath = normalizePath(path);
  const descendantParts = splitPath(descendant);
  descendantParts.pop();
  if (normalizedPath === descendantParts.join("/")) {
    return true;
  }
}

export function isFolderAncestor(path: string, folderPath: string): boolean {
  const pathParts = splitPath(path);
  const folderParts = splitPath(folderPath);

  if (folderParts.length >= pathParts.length) {
    return false;
  }

  for (let i = 0; i < folderParts.length; i++) {
    if (folderParts[i] !== pathParts[i]) {
      return false;
    }
  }

  return true;
}

export function splitPath(path: string): string[] {
  return path.split("/").filter((p) => p !== "");
}

export function normalizePath(path: string): string {
  return splitPath(path).join("/");
}

export function getParentFolder(folderPath: string): string {
  const parts = splitPath(folderPath);
  parts.pop();
  return parts.join("/");
}

export function isRootFolder(folderPath: string): boolean {
  return normalizePath(folderPath) === "";
}

export function getNameFromPath(path: string): string {
  const parts = splitPath(path);
  return parts[parts.length - 1];
}
