import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const importFresh = async (absolutePath) => {
  const cacheBuster = `t=${Date.now()}-${Math.random()}`;
  const asFileUrl = pathToFileURL(path.resolve(absolutePath)).href;
  return import(`${asFileUrl}?${cacheBuster}`);
};
