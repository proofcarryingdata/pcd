import _ from "lodash";

export function getFoldersInFolder(
  folderPath: string,
  allPaths: string[]
): string[] {
  return _.uniq(allPaths.filter((p) => isFolderAncestor(p, folderPath)));
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
