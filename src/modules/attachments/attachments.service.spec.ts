import { AttachmentsService } from './attachments.service';

describe('AttachmentsService', () => {
  describe('saveUpload', () => {
    it('uploads to Supabase Storage under <referenceType>/<referenceId>/<file> and persists the path via repo.create/save', async () => {
      const repo = {
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve({ attachmentId: 1, ...v })),
      } as any;
      const storage = { upload: jest.fn().mockResolvedValue(undefined) } as any;
      const service = new AttachmentsService(repo, storage);

      const file = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 12345,
        buffer: Buffer.from('fake-image-bytes'),
      } as Express.Multer.File;

      const result = await service.saveUpload(file, { referenceType: 'asset', referenceId: 42 }, 7);

      expect(storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^asset\/42\/[\w-]+\.jpg$/),
        file.buffer,
        'image/jpeg',
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: 'asset',
          referenceId: 42,
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 12345,
          uploadedBy: 7,
        }),
      );
      expect(result.fileUrl).toMatch(/^asset\/42\/[\w-]+\.jpg$/);
    });
  });

  describe('findByReference', () => {
    it('replaces stored storage paths with fresh signed URLs, but leaves external http(s) URLs untouched', async () => {
      const stored = [
        { attachmentId: 1, fileUrl: 'asset/5/abc.jpg' },
        { attachmentId: 2, fileUrl: 'https://external.example.com/scan.pdf' },
      ];
      const repo = { find: jest.fn().mockResolvedValue(stored) } as any;
      const storage = { createSignedUrl: jest.fn().mockResolvedValue('https://signed.example.com/abc.jpg?token=x') } as any;
      const service = new AttachmentsService(repo, storage);

      const result = await service.findByReference('asset', 5);

      expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
      expect(storage.createSignedUrl).toHaveBeenCalledWith('asset/5/abc.jpg');
      expect(result[0].fileUrl).toBe('https://signed.example.com/abc.jpg?token=x');
      expect(result[1].fileUrl).toBe('https://external.example.com/scan.pdf');
    });
  });

  describe('remove', () => {
    it('deletes the Supabase Storage object for internally-stored files', async () => {
      const attachment = { attachmentId: 1, fileUrl: 'asset/5/abc.jpg' };
      const repo = { findOne: jest.fn().mockResolvedValue(attachment), remove: jest.fn().mockResolvedValue(undefined) } as any;
      const storage = { remove: jest.fn().mockResolvedValue(undefined) } as any;
      const service = new AttachmentsService(repo, storage);

      await service.remove(1);

      expect(storage.remove).toHaveBeenCalledWith('asset/5/abc.jpg');
      expect(repo.remove).toHaveBeenCalledWith(attachment);
    });

    it('does not attempt to delete external URLs from Supabase Storage', async () => {
      const attachment = { attachmentId: 2, fileUrl: 'https://external.example.com/scan.pdf' };
      const repo = { findOne: jest.fn().mockResolvedValue(attachment), remove: jest.fn().mockResolvedValue(undefined) } as any;
      const storage = { remove: jest.fn() } as any;
      const service = new AttachmentsService(repo, storage);

      await service.remove(2);

      expect(storage.remove).not.toHaveBeenCalled();
    });
  });
});
