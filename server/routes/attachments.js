"use strict";

const { Router } = require("express");
const multer = require("multer");
const db = require("../db.js");
const {
  AttachmentService,
  AttachmentServiceError,
  MAX_FILES,
  MAX_FILE_BYTES,
} = require("../attachment-service.js");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_FILES, fileSize: MAX_FILE_BYTES },
});
let defaultService;

function serviceFor(req) {
  if (req.app.locals.attachmentService) return req.app.locals.attachmentService;
  defaultService ||= new AttachmentService({ db });
  return defaultService;
}

router.post("/api/attachments", (req, res) => {
  upload.array("file", MAX_FILES)(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ error: { message: uploadError.message } });
    }
    try {
      const attachments = await serviceFor(req).saveBatch(req.user.userId, req.files || []);
      return res.status(201).json({ attachments });
    } catch (error) {
      const status = error instanceof AttachmentServiceError ? error.status : 500;
      return res.status(status).json({
        error: { message: error instanceof Error ? error.message : "附件上传失败" },
      });
    }
  });
});

module.exports = router;
