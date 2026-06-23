import { describe, expect, it } from "vitest";
import { CsvFormatError, detectDelimiter, importPeopleCsv, parseCsv } from "./csvImport";

describe("detectDelimiter", () => {
  it("détecte le point-virgule (Excel FR)", () => {
    expect(detectDelimiter("Nom;Poste;Email")).toBe(";");
  });

  it("détecte la virgule", () => {
    expect(detectDelimiter("Name,Role,Email")).toBe(",");
  });

  it("détecte la tabulation", () => {
    expect(detectDelimiter("Nom\tPoste\tEmail")).toBe("\t");
  });
});

describe("parseCsv", () => {
  it("gère les guillemets et les séparateurs internes", () => {
    const rows = parseCsv('Nom;Poste\n"Dupont; Jean";"Directeur ""Général"""', ";");
    expect(rows).toEqual([
      ["Nom", "Poste"],
      ["Dupont; Jean", 'Directeur "Général"'],
    ]);
  });

  it("ignore les lignes vides et gère CRLF", () => {
    const rows = parseCsv("a;b\r\n\r\n1;2\r\n", ";");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("importPeopleCsv", () => {
  const csv = [
    "Nom;Poste;Pôle;Email;Responsable",
    "Alice Martin;Directrice Générale;Direction;alice@corp.fr;",
    "Bruno Diaz;Responsable Marketing;Marketing;bruno@corp.fr;Alice Martin",
    "Chloé Yun;Chargée de com;Marketing;chloe@corp.fr;Bruno Diaz",
  ].join("\n");

  it("crée les nœuds avec leurs données", () => {
    const { nodes, warnings } = importPeopleCsv(csv);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].data).toMatchObject({
      name: "Alice Martin",
      role: "Directrice Générale",
      department: "Direction",
      email: "alice@corp.fr",
    });
    expect(warnings).toHaveLength(0);
  });

  it("reconstruit la hiérarchie via la colonne Responsable", () => {
    const { nodes, edges } = importPeopleCsv(csv);
    expect(edges).toHaveLength(2);
    const alice = nodes.find((n) => n.data.name === "Alice Martin")!;
    const bruno = nodes.find((n) => n.data.name === "Bruno Diaz")!;
    const chloe = nodes.find((n) => n.data.name === "Chloé Yun")!;
    expect(edges).toContainEqual(expect.objectContaining({ source: alice.id, target: bruno.id }));
    expect(edges).toContainEqual(expect.objectContaining({ source: bruno.id, target: chloe.id }));
  });

  it("résout le responsable par email et ignore casse/accents", () => {
    const input = [
      "nom,manager,e-mail",
      "Hélène Roux,,helene@corp.fr",
      "Marc Petit,HELENE@CORP.FR,marc@corp.fr",
      "Zoé Blanc,helène roux,zoe@corp.fr",
    ].join("\n");
    const { edges, warnings } = importPeopleCsv(input);
    expect(edges).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });

  it("signale un responsable introuvable sans bloquer", () => {
    const input = "Nom;Responsable\nJean Dupont;Inconnu Total";
    const { nodes, edges, warnings } = importPeopleCsv(input);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
    expect(warnings[0]).toContain("Inconnu Total");
  });

  it("ignore les lignes sans nom avec avertissement", () => {
    const input = "Nom;Poste\nAlice;Dir\n;Fantôme";
    const { nodes, warnings } = importPeopleCsv(input);
    expect(nodes).toHaveLength(1);
    expect(warnings[0]).toContain("nom manquant");
  });

  it("refuse une personne comme son propre responsable", () => {
    const input = "Nom;Responsable\nAlice;Alice";
    const { edges, warnings } = importPeopleCsv(input);
    expect(edges).toHaveLength(0);
    expect(warnings[0]).toContain("propre responsable");
  });

  it("rejette un fichier sans colonne nom", () => {
    expect(() => importPeopleCsv("Poste;Email\nDir;a@b.fr")).toThrow(CsvFormatError);
  });

  it("rejette un fichier vide", () => {
    expect(() => importPeopleCsv("   ")).toThrow(CsvFormatError);
  });

  it("tolère le BOM Excel en tête de fichier", () => {
    const { nodes } = importPeopleCsv("﻿Nom;Poste\nAlice;Dir");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.name).toBe("Alice");
  });
});
