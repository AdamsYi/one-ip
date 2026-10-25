import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyParsedTraces,
  parseTraceOutput,
} from "../src/lib/parse-trace.ts";

const nexttraceCt = `
traceroute to 219.141.140.10 (219.141.140.10), 30 hops max, 60 byte packets
 1  38.142.100.1  [AS53667 FranTech]  0.4 ms
 2  23.19.85.89  [AS20473 ]  1.2 ms
 3  59.43.182.235  [AS4809 CHINATELECOM-CORE-WAN-CN2]  140.1 ms
 4  59.43.130.18  [AS4809 CHINATELECOM-CORE-WAN-CN2]  141.0 ms
 5  59.43.130.10  [AS4809 CHINATELECOM-CORE-WAN-CN2]  142.2 ms
 6  219.141.140.10  [AS4134 Chinanet]  143.5 ms
`;

const nexttraceCtGt = `
traceroute to 202.96.209.133 (202.96.209.133), 30 hops max
 1  38.142.100.1  [AS53667]  0.4 ms
 2  202.97.52.233  [AS4134 Chinanet]  150.2 ms
 3  202.97.57.237  [AS4134 Chinanet]  151.0 ms
 4  59.43.34.34  [AS4809]  152.2 ms
 5  202.96.209.133  [AS4134]  153.5 ms
`;

const nexttraceCu = `
traceroute to 202.106.195.68 (202.106.195.68), 30 hops max
 1  38.142.100.1  [AS53667]  0.4 ms
 2  219.158.20.1  [AS4837 China Unicom Backbone]  148.2 ms
 3  219.158.27.42  [AS4837 China Unicom Backbone]  149.0 ms
 4  202.106.195.68  [AS4808]  150.2 ms
`;

const nexttraceCm = `
traceroute to 221.179.155.161 (221.179.155.161), 30 hops max
 1  38.142.100.1  [AS53667]  0.4 ms
 2  223.120.4.1  [AS58453 CMI]  147.2 ms
 3  223.120.6.30  [AS58453 CMI]  148.0 ms
 4  221.179.155.161  [AS9808]  149.1 ms
`;

const plainTraceroute = `
traceroute to 61.139.2.69 (61.139.2.69), 30 hops max, 60 byte packets
 1  38.142.100.1 (38.142.100.1)  0.412 ms
 2  59.43.0.1 (59.43.0.1)  142.101 ms
 3  202.97.1.1 (202.97.1.1)  143.220 ms
 4  61.139.2.69 (61.139.2.69)  144.011 ms
`;

const backtraceStyle = `
北京电信 219.141.140.10 :
    1. 38.142.100.1 [AS53667 PONYNET]
    2. 59.43.0.1 [AS4809 CHINATELECOM-CORE-WAN-CN2]
    3. 59.43.1.1 [AS4809 CHINATELECOM-CORE-WAN-CN2]
    4. 219.141.140.10 [AS4134 CHINANET]
北京方向: 电信 CN2GIA [精品线路]
以下是 IP 的回程路由速报
`;

test("parse nexttrace output and classify each carrier", () => {
  const traces = parseTraceOutput(
    nexttraceCt + nexttraceCtGt + nexttraceCu + nexttraceCm,
  );
  assert.equal(traces.length, 4);  // two CT blocks + CU + CM
  const verdicts = classifyParsedTraces(traces);
  const ct = verdicts.filter((v) => v.carrier === "CT");
  assert.equal(ct.length, 1);
  // two CT traces merged: gia (rank 5) + gt (rank 3) → dynamic mixed
  assert.equal(ct[0].code, "dynamic_mixed");
  const cu = verdicts.find((v) => v.carrier === "CU");
  assert.equal(cu?.code, "4837");
  assert.equal(cu?.reason, "cu4837");
  const cm = verdicts.find((v) => v.carrier === "CM");
  assert.equal(cm?.code, "cmi");
});

test("parse single nexttrace CN2 GIA run", () => {
  const verdicts = classifyParsedTraces(parseTraceOutput(nexttraceCt));
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].carrier, "CT");
  assert.equal(verdicts[0].code, "cn2_gia");
  assert.equal(verdicts[0].reason, "cn2_gia");
  assert.equal(verdicts[0].hops.length, 6);
  assert.equal(verdicts[0].hops[2].asn, 4809);
});

test("parse plain traceroute with CIDR fallback when AS is absent", () => {
  const verdicts = classifyParsedTraces(parseTraceOutput(plainTraceroute));
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].carrier, "CT");
  // hops: -1, 4809 (from 59.43.0.1 CIDR), 4134 (202.97), delivery
  // one 4809 hop + a 163 hop → cn2_single mixed
  assert.equal(verdicts[0].code, "cn2_mixed");
  assert.ok(verdicts[0].hops.some((hop) => hop.asn === 4809));
  assert.ok(verdicts[0].hops.some((hop) => hop.asn === 4134));
});

test("parse backtrace-style output", () => {
  const verdicts = classifyParsedTraces(parseTraceOutput(backtraceStyle));
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].carrier, "CT");
  assert.equal(verdicts[0].code, "cn2_gia");
});

test("unrelated text yields no traces", () => {
  assert.deepEqual(parseTraceOutput("hello world\n1.2.3.4 nope"), []);
  assert.deepEqual(parseTraceOutput(""), []);
});
