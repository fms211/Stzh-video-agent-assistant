"use strict";
const { Router } = require("express");
const db = require("../db.js");
const { createStudioMemoryStore, MemoryError } = require("../studio-memory-store.js");
const { requireUser } = require("../middleware/auth.js");
const store = createStudioMemoryStore(db);
const summaries = require("../studio-summary-store.js").createStudioSummaryStore(db);
const notes=require("../studio-project-notes.js").createStudioProjectNotes(db);
const router = Router();
router.use("/api/studio/memories", requireUser, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use("/api/studio/summaries", requireUser, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use("/api/studio/project-notes",requireUser,(_req,res,next)=>{res.set("Cache-Control","no-store");next();});
const endpoint = handler => (req, res, next) => {
  try { handler(req, res); } catch (error) {
    if (error instanceof MemoryError) res.status(error.status).json({ error: { code: error.code, message: error.message } });
    else next(error);
  }
};
const revision = body => {
  if (!body || Object.keys(body).some(key => key !== "expectedRevision")) throw new MemoryError("INVALID_MEMORY_INPUT", "只能提供版本号");
  return body.expectedRevision;
};
router.get("/api/studio/project-notes/:projectId",endpoint((req,res)=>res.json({item:notes.get(req.user.userId,req.params.projectId)})));
router.put("/api/studio/project-notes/:projectId",endpoint((req,res)=>res.json({item:notes.save(req.user.userId,req.params.projectId,req.body)})));
router.delete("/api/studio/project-notes/:projectId",endpoint((req,res)=>res.json({item:notes.remove(req.user.userId,req.params.projectId,revision(req.body))})));
router.post("/api/studio/summaries", endpoint((req,res) => {
  const body=req.body;
  if(!body||Object.keys(body).some(key=>!["mode","sessionId","keepRecent","query"].includes(key)))throw new MemoryError("INVALID_SUMMARY_INPUT","摘要字段无效");
  const result=summaries.build(req.user.userId,body);res.status(result.created?201:200).json(result);
}));
router.get("/api/studio/summaries",endpoint((req,res)=>res.json(summaries.list(req.user.userId,{mode:req.query.mode,sessionId:req.query.sessionId,before:req.query.before===undefined?undefined:Number(req.query.before)}))));
router.get("/api/studio/summaries/:id", endpoint((req,res)=>res.json({item:summaries.get(req.user.userId,req.params.id)})));
router.get("/api/studio/summaries/:id/sources", endpoint((req,res)=>res.json(summaries.sources(req.user.userId,req.params.id,req.query.offset===undefined?0:Number(req.query.offset)))));
router.delete("/api/studio/summaries/:id", endpoint((req,res)=>{summaries.remove(req.user.userId,req.params.id);res.status(204).end();}));
router.get("/api/studio/memories", endpoint((req, res) => res.json(store.list(req.user.userId, { limit: req.query.limit === undefined ? 50 : Number(req.query.limit), after: req.query.after ?? "" }))));
router.get("/api/studio/memories/export", endpoint((req, res) => res.json(store.exportItems(req.user.userId))));
router.get("/api/studio/memories/context-status", endpoint((_req, res) => res.json(require("../studio-context-rollout.js").contextRolloutStatus())));
router.post("/api/studio/memories/search", endpoint((req, res) => res.json(store.search(req.user.userId, req.body))));
const present = (userId, item) => ({ ...item, sourceAvailable: store.available(userId, item), sourceState: store.sourceState(userId, item) });
router.get("/api/studio/memories/:id/source", endpoint((req, res) => res.json(store.readSource(req.user.userId, req.params.id))));
router.post("/api/studio/memories/:id/refresh-source", endpoint((req, res) => res.json({ item: present(req.user.userId, store.refreshSource(req.user.userId, req.params.id, req.body)) })));
router.get("/api/studio/memories/:id", endpoint((req, res) => res.json({ item: present(req.user.userId, store.get(req.user.userId, req.params.id)) })));
router.post("/api/studio/memories", endpoint((req, res) => {
  const result = store.create(req.user.userId, req.body); res.status(result.created ? 201 : 200).json({ ...result, item: present(req.user.userId, result.item) });
}));
router.patch("/api/studio/memories/:id", endpoint((req, res) => res.json({ item: present(req.user.userId, store.update(req.user.userId, req.params.id, req.body)) })));
router.post("/api/studio/memories/:id/confirm", endpoint((req, res) => res.json({ item: present(req.user.userId, store.confirm(req.user.userId, req.params.id, revision(req.body))) })));
router.delete("/api/studio/memories/:id", endpoint((req, res) => { store.remove(req.user.userId, req.params.id, revision(req.body)); res.status(204).end(); }));
module.exports = router;
