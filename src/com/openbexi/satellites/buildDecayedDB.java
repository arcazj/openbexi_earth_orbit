package com.openbexi.satellites;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * buildDecayedDB
 *
 * Reads:  json/satcat.csv   (CelesTrak SATCAT CSV)
 * Writes: json/decayed/decayed.json
 *
 * Filters:
 *   - DECAY_DATE not empty
 *   - OBJECT_TYPE == "PAY"   (payloads)
 *
 * Output grouped by OBJECT_NAME:
 * {
 *   "OBJECT_NAME": [
 *     {"OBJECT_NAME":"...", "OBJECT_ID":"...", ...},
 *     ...
 *   ],
 *   ...
 * }
 */
public class buildDecayedDB {

    private static final String INPUT_CSV   = "json/satcat.csv";
    private static final String OUTPUT_JSON = "json/decayed/decayed.json";

    // Columns
    private static final String COL_OBJECT_NAME  = "OBJECT_NAME";
    private static final String COL_OBJECT_ID    = "OBJECT_ID";
    private static final String COL_NORAD_CAT_ID = "NORAD_CAT_ID";
    private static final String COL_OBJECT_TYPE  = "OBJECT_TYPE";
    private static final String COL_LAUNCH_DATE  = "LAUNCH_DATE";
    private static final String COL_LAUNCH_SITE  = "LAUNCH_SITE";
    private static final String COL_DECAY_DATE   = "DECAY_DATE";

    public static void main(String[] args) {
        try {
            run();
        } catch (Exception e) {
            System.err.println("ERROR: " + e.getMessage());
            e.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static void run() throws IOException {
        Path input = Paths.get(INPUT_CSV);
        if (!Files.exists(input)) {
            throw new FileNotFoundException("Input not found: " + input.toAbsolutePath());
        }

        try (BufferedReader br = Files.newBufferedReader(input, StandardCharsets.UTF_8)) {
            String headerLine = br.readLine();
            if (headerLine == null || headerLine.trim().isEmpty()) {
                throw new IllegalArgumentException("Empty CSV: " + input.toAbsolutePath());
            }

            // SATCAT is standard CSV with comma delimiter
            final char delimiter = ',';

            List<String> header = parseDelimitedLine(headerLine, delimiter);
            Map<String, Integer> idx = indexMap(header);

            requireColumn(idx, COL_OBJECT_NAME);
            requireColumn(idx, COL_OBJECT_ID);
            requireColumn(idx, COL_NORAD_CAT_ID);
            requireColumn(idx, COL_OBJECT_TYPE);
            requireColumn(idx, COL_LAUNCH_DATE);
            requireColumn(idx, COL_LAUNCH_SITE);
            requireColumn(idx, COL_DECAY_DATE);

            Map<String, List<Map<String, String>>> grouped = new TreeMap<>();

            long rowsRead = 0;
            long kept = 0;

            String line;
            while ((line = br.readLine()) != null) {
                if (line.trim().isEmpty()) continue;

                List<String> row = parseDelimitedLine(line, delimiter);
                rowsRead++;

                String decayDate = get(row, idx.get(COL_DECAY_DATE));
                if (isBlank(decayDate)) continue;

                // Payload filter: OBJECT_TYPE must be PAY
                String objectType = get(row, idx.get(COL_OBJECT_TYPE));
                if (!"PAY".equalsIgnoreCase(safeTrim(objectType))) continue;

                Map<String, String> rec = new LinkedHashMap<>();
                rec.put(COL_OBJECT_NAME,  get(row, idx.get(COL_OBJECT_NAME)));
                rec.put(COL_OBJECT_ID,    get(row, idx.get(COL_OBJECT_ID)));
                rec.put(COL_NORAD_CAT_ID, get(row, idx.get(COL_NORAD_CAT_ID)));
                rec.put(COL_OBJECT_TYPE,  safeTrim(objectType));
                rec.put(COL_LAUNCH_DATE,  get(row, idx.get(COL_LAUNCH_DATE)));
                rec.put(COL_LAUNCH_SITE,  get(row, idx.get(COL_LAUNCH_SITE)));
                rec.put(COL_DECAY_DATE,   decayDate);

                String objectNameKey = safeTrim(rec.get(COL_OBJECT_NAME));
                if (objectNameKey.isEmpty()) objectNameKey = "(UNKNOWN_OBJECT_NAME)";

                grouped.computeIfAbsent(objectNameKey, k -> new ArrayList<>()).add(rec);
                kept++;
            }

            Path out = Paths.get(OUTPUT_JSON);
            Files.createDirectories(out.getParent());

            String json = toJsonGrouped(grouped);
            Files.write(out, json.getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

            System.out.println("buildDecayedDB complete.");
            System.out.println("Input file:  " + input.toAbsolutePath());
            System.out.println("Output file: " + out.toAbsolutePath());
            System.out.println("Rows read:   " + rowsRead);
            System.out.println("Records kept (DECAY_DATE not empty AND OBJECT_TYPE=PAY): " + kept);
        }
    }

    private static Map<String, Integer> indexMap(List<String> header) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < header.size(); i++) {
            map.put(safeTrim(header.get(i)).toUpperCase(Locale.ROOT), i);
        }
        return map;
    }

    private static void requireColumn(Map<String, Integer> idx, String colName) {
        if (!idx.containsKey(colName.toUpperCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Missing required column: " + colName);
        }
    }

    private static String get(List<String> row, int index) {
        if (index < 0 || index >= row.size()) return "";
        return safeTrim(row.get(index));
    }

    private static String safeTrim(String s) {
        return s == null ? "" : s.trim();
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    /**
     * Minimal CSV parser for a single line supporting quoted fields:
     * - delimiter is ','
     * - double quotes may wrap a field; inside quotes "" -> "
     */
    private static List<String> parseDelimitedLine(String line, char delimiter) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);

            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        cur.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cur.append(c);
                }
            } else {
                if (c == '"') {
                    inQuotes = true;
                } else if (c == delimiter) {
                    out.add(cur.toString());
                    cur.setLength(0);
                } else {
                    cur.append(c);
                }
            }
        }
        out.add(cur.toString());
        return out;
    }

    private static String toJsonGrouped(Map<String, List<Map<String, String>>> grouped) {
        StringBuilder sb = new StringBuilder(1024 * 1024);
        sb.append("{\n");

        int nameCount = 0;
        for (Map.Entry<String, List<Map<String, String>>> e : grouped.entrySet()) {
            if (nameCount++ > 0) sb.append(",\n");
            sb.append("  \"").append(jsonEscape(e.getKey())).append("\": [\n");

            List<Map<String, String>> records = e.getValue();
            for (int i = 0; i < records.size(); i++) {
                if (i > 0) sb.append(",\n");
                sb.append("    ").append(toJsonObject(records.get(i)));
            }
            sb.append("\n  ]");
        }

        sb.append("\n}\n");
        return sb.toString();
    }

    private static String toJsonObject(Map<String, String> obj) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        int k = 0;
        for (Map.Entry<String, String> e : obj.entrySet()) {
            if (k++ > 0) sb.append(", ");
            sb.append("\"").append(jsonEscape(e.getKey())).append("\": ");
            sb.append("\"").append(jsonEscape(e.getValue())).append("\"");
        }
        sb.append("}");
        return sb.toString();
    }

    private static String jsonEscape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"':  sb.append("\\\""); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }
}

