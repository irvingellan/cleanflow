import { describe, expect, it } from "vitest";
import {
  buildClientReportMessage,
  buildClientReportSubject,
  clientReportEmailUrl,
  clientReportWhatsappUrl,
  whatsappDigits,
} from "./clientReportShare.js";

const url = "https://cleanflow.example/client-report?t=opaque";

describe("client report sharing", () => {
  it("writes a short message in the chosen language with the first name and link", () => {
    expect(buildClientReportMessage({ language: "en", clientName: "Dana Example", propertyName: "Seaside House", serviceDate: "Sep 23", url }))
      .toBe(`Hi Dana! The cleaning at Seaside House on Sep 23 is done. Here is the report with the photos: ${url}`);
    expect(buildClientReportMessage({ language: "pt", clientName: "", propertyName: "Casa", url }))
      .toBe(`Olá! A limpeza de Casa foi concluída. Aqui está o relatório com as fotos: ${url}`);
    expect(buildClientReportMessage({ language: "es", url })).toContain(url);
    expect(buildClientReportMessage({ language: "xx", url })).toMatch(/^Hi!/);
    expect(buildClientReportSubject({ language: "pt", propertyName: "Casa" })).toBe("Relatório de limpeza — Casa");
  });

  it("addresses WhatsApp to a US or international number, or lets the manager pick the chat", () => {
    expect(whatsappDigits("(555) 010-2030")).toBe("15550102030");
    expect(whatsappDigits("+55 11 91234-5678")).toBe("5511912345678");
    expect(whatsappDigits("123")).toBe("");
    expect(whatsappDigits(undefined)).toBe("");
    expect(clientReportWhatsappUrl({ phone: "", message: "Hi & bye" })).toBe("https://wa.me/?text=Hi%20%26%20bye");
  });

  it("builds a mailto link only with a plausible address", () => {
    expect(clientReportEmailUrl({ email: "dana@example.com", subject: "S", message: "M" })).toBe("mailto:dana@example.com?subject=S&body=M");
    expect(clientReportEmailUrl({ email: "not an email", subject: "S", message: "M" })).toBe("mailto:?subject=S&body=M");
  });
});
