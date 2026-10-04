"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { MODE_KEYS, globalRollout, resolveContextRollout, rolloutMode, contextRolloutStatus } = require("../studio-context-rollout.js");

test("legacy global default and invalid global remain shadow without disclosing raw values", () => {
  assert.equal(rolloutMode(undefined, {}), "shadow");
  assert.equal(globalRollout({STZH_CONTEXT_MODE:"unexpected-private-value"}).configurationValid, false);
  assert.doesNotMatch(JSON.stringify(contextRolloutStatus({STZH_CONTEXT_MODE:"unexpected-private-value"})), /unexpected-private-value/);
  for (const rollout of ["off","shadow","enforce"]) assert.equal(rolloutMode(undefined, {STZH_CONTEXT_MODE:rollout}), rollout);
});
test("every canonical mode can be overridden without enabling its neighbours", () => {
  for (const [mode,key] of Object.entries(MODE_KEYS)) {
    const env = {STZH_CONTEXT_MODE:"shadow", [key]:"enforce"};
    const status = contextRolloutStatus(env);
    for (const other of Object.keys(MODE_KEYS)) {
      assert.equal(status.byMode[other].rollout, other === mode ? "enforce" : "shadow");
      assert.equal(status.byMode[other].source, other === mode ? "mode_override" : "global");
    }
    assert.equal(rolloutMode(undefined,env),"shadow");
    assert.equal(rolloutMode(mode,env),"enforce");
  }
});
test("global off overrides all per-mode settings, including invalid ones", () => {
  const env = {STZH_CONTEXT_MODE:"off", ...Object.fromEntries(Object.values(MODE_KEYS).map(key=>[key,"enforce"]))};
  env.STZH_CONTEXT_MODE_COZE = "invalid";
  for (const status of Object.values(contextRolloutStatus(env).byMode)) assert.deepEqual(status,{rollout:"off",source:"global_off",configurationValid:true});
});
test("invalid explicit override fails closed; missing and blank override inherit", () => {
  for (const setting of ["ENFORCE","invalid",true,1]) {
    const result = resolveContextRollout("assistant",{STZH_CONTEXT_MODE:"enforce",STZH_CONTEXT_MODE_ASSISTANT:setting});
    assert.equal(result.rollout,"off"); assert.equal(result.configurationValid,false); assert.equal(result.source,"invalid_override");
  }
  for (const setting of [undefined,"","   "]) assert.equal(resolveContextRollout("assistant",{STZH_CONTEXT_MODE:"enforce",STZH_CONTEXT_MODE_ASSISTANT:setting}).rollout,"enforce");
});
test("invalid mode never becomes enforce or leaks arbitrary input", () => {
  for (const mode of ["unknown","__proto__","constructor",null]) {
    const result=resolveContextRollout(mode,{STZH_CONTEXT_MODE:"enforce"});
    assert.deepEqual(result,{mode:null,rollout:"off",source:"invalid_mode",configurationValid:false});
  }
});
test("effective valid override is independent of an invalid global; status reads do not mutate input", () => {
  const env=Object.freeze({STZH_CONTEXT_MODE:"invalid",STZH_CONTEXT_MODE_COZE:"enforce"});
  const status=contextRolloutStatus(env);
  assert.equal(status.configurationValid,false); assert.equal(status.rollout,"shadow");
  assert.equal(status.byMode.coze.configurationValid,true); assert.equal(status.byMode.coze.rollout,"enforce");
  assert.equal(status.byMode.workflow.source,"invalid_global");
  assert.deepEqual(env,{STZH_CONTEXT_MODE:"invalid",STZH_CONTEXT_MODE_COZE:"enforce"});
});
