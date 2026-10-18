import { getStorage } from "firebase-admin/storage";

/**
 * Acesso mínimo ao armazenamento de objetos, para permitir testes sem Storage
 * real. A implementação de produção usa o bucket padrão do projeto (Admin SDK,
 * que não é limitado pelas storage.rules).
 */
export interface ObjectStore {
  /** Tamanho em bytes, ou null se o objeto não existe. */
  size(path: string): Promise<number | null>;
  read(path: string): Promise<Buffer>;
  copy(from: string, to: string): Promise<void>;
  /** Remove o objeto; ignora se não existir. */
  remove(path: string): Promise<void>;
}

export function createGcsObjectStore(): ObjectStore {
  const bucket = () => getStorage().bucket();
  return {
    async size(path) {
      const file = bucket().file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [meta] = await file.getMetadata();
      return Number(meta.size ?? 0);
    },
    async read(path) {
      const [data] = await bucket().file(path).download();
      return data;
    },
    async copy(from, to) {
      await bucket().file(from).copy(bucket().file(to));
    },
    async remove(path) {
      await bucket().file(path).delete({ ignoreNotFound: true });
    },
  };
}
