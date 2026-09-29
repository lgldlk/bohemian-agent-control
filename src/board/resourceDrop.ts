import type { Editor, TLShapeId } from 'tldraw';
import { findBoardResourceImporter } from './plugins/resourceRuntime';
import type { BoardResourceImporterContribution } from './plugins/resourceTypes';
import { createResourceShape } from './resourceBoardOperations';
import { mapSettledWithConcurrency, resourceDropPositions } from './resourceDropModel';
import { uploadDroppedResourceFile } from '@/resources/resourceApi';

const MAX_CONCURRENT_RESOURCE_IMPORTS = 4;

export interface BoardResourceDropResult {
  importedShapeIds: TLShapeId[];
  rejectedFiles: string[];
  failedFiles: string[];
}

export async function importDroppedFilesToBoard(
  editor: Editor,
  files: readonly File[],
  point: { x: number; y: number },
): Promise<BoardResourceDropResult> {
  const candidates = files.map((file) => ({
    file,
    importer: findBoardResourceImporter({
      name: file.name,
      size: file.size,
      mimeType: file.type,
      lastModified: file.lastModified,
    }),
  }));
  const accepted = candidates.filter((candidate): candidate is { file: File; importer: BoardResourceImporterContribution } =>
    candidate.importer !== null);
  const rejectedFiles = candidates.filter((candidate) => candidate.importer === null).map(({ file }) => file.name);
  const uploaded = await mapSettledWithConcurrency(
    accepted,
    MAX_CONCURRENT_RESOURCE_IMPORTS,
    async ({ file, importer }) => ({
      file,
      resource: importer.createResource(await uploadDroppedResourceFile(file)),
    }),
  );

  const successful = uploaded.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const failedFiles = uploaded.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const name = accepted[index]?.file.name ?? 'unknown file';
    console.error(`[board-resource-import:${name}] failed`, result.reason);
    return [name];
  });
  const multiple = successful.length > 1;
  const positions = resourceDropPositions(successful.map(({ resource }) => resource), point);
  const importedShapeIds = successful.map(({ resource }, index) => createResourceShape(editor, resource, {
    ...positions[index],
    focus: !multiple,
  }));

  if (multiple && importedShapeIds.length > 0) {
    editor.setSelectedShapes(importedShapeIds);
    const zoom = () => editor.zoomToSelection({ animation: { duration: 240 } });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(zoom);
    else zoom();
  }

  return { importedShapeIds, rejectedFiles, failedFiles };
}
