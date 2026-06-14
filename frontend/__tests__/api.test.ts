import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJob,
  deleteApplication,
  getProfile,
  updateStatus,
} from "../app/lib/api";

const BASE = "http://localhost:8000";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "x",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));
  // @ts-expect-error - assigning a test double to the global
  globalThis.fetch = fn;
  return fn;
}

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("GETs the profile from the right URL and parses JSON", async () => {
    const fetchMock = mockFetch(200, { id: 1, full_name: "Test Dev" });
    const profile = await getProfile();
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/profile`, undefined);
    expect(profile.full_name).toBe("Test Dev");
  });

  it("POSTs createJob with JSON content-type and a serialized body", async () => {
    const fetchMock = mockFetch(200, { id: 7 });
    await createJob({ company: "Acme", title: "SWE" } as never);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/jobs`);
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ company: "Acme", title: "SWE" });
  });

  it("PATCHes status with the status + note in the body", async () => {
    const fetchMock = mockFetch(200, { id: 3, status: "OFFER" });
    await updateStatus(3, "OFFER", "great news");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/applications/3/status`);
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({ status: "OFFER", note: "great news" });
  });

  it("returns undefined for a 204 DELETE", async () => {
    mockFetch(204, "");
    await expect(deleteApplication(9)).resolves.toBeUndefined();
  });

  it("throws a descriptive error on a non-2xx response", async () => {
    mockFetch(500, "boom");
    await expect(getProfile()).rejects.toThrow(/API error 500/);
  });
});
