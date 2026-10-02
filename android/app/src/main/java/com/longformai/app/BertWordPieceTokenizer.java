package com.longformai.app;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lightweight Java WordPiece tokenizer for BERT / all-MiniLM-L6-v2.
 * Exact behavioral replica of server/matching_server.py BertWordPieceTokenizer.
 */
public class BertWordPieceTokenizer {
    private final Map<String, Integer> vocab = new HashMap<>(32000);
    private final Map<Integer, String> invVocab = new HashMap<>(32000);

    public final String padToken = "[PAD]";
    public final String unkToken = "[UNK]";
    public final String clsToken = "[CLS]";
    public final String sepToken = "[SEP]";

    public int padTokenId = 0;
    public int unkTokenId = 100;
    public int clsTokenId = 101;
    public int sepTokenId = 102;
    public int maxInputCharsPerWord = 100;

    // Pattern equivalent to Python's re.findall(r'\w+|[^\w\s]', text, re.UNICODE) compatible with Android ICU
    private static final Pattern WORD_PATTERN = Pattern.compile("[\\p{L}\\p{N}\\p{M}_]+|[^\\p{L}\\p{N}\\p{M}_\\s]");

    public void loadVocab(InputStream is) throws IOException {
        vocab.clear();
        invVocab.clear();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            int idx = 0;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                vocab.put(line, idx);
                invVocab.put(idx, line);
                idx++;
            }
        }
        padTokenId = vocab.getOrDefault(padToken, 0);
        unkTokenId = vocab.getOrDefault(unkToken, 100);
        clsTokenId = vocab.getOrDefault(clsToken, 101);
        sepTokenId = vocab.getOrDefault(sepToken, 102);
    }

    public void loadVocab(File file) throws IOException {
        try (InputStream is = new FileInputStream(file)) {
            loadVocab(is);
        }
    }

    public int getVocabSize() {
        return vocab.size();
    }

    private List<String> tokenizeWord(String word) {
        if (word.length() > maxInputCharsPerWord) {
            List<String> unk = new ArrayList<>(1);
            unk.add(unkToken);
            return unk;
        }
        boolean isBad = false;
        int start = 0;
        List<String> subTokens = new ArrayList<>();
        while (start < word.length()) {
            int end = word.length();
            String curSubstr = null;
            while (start < end) {
                String substr = word.substring(start, end);
                if (start > 0) {
                    substr = "##" + substr;
                }
                if (vocab.containsKey(substr)) {
                    curSubstr = substr;
                    break;
                }
                end--;
            }
            if (curSubstr == null) {
                isBad = true;
                break;
            }
            subTokens.add(curSubstr);
            start = end;
        }
        if (isBad) {
            List<String> unk = new ArrayList<>(1);
            unk.add(unkToken);
            return unk;
        }
        return subTokens;
    }

    public List<Integer> tokenize(String text) {
        if (text == null) text = "";
        text = text.toLowerCase(Locale.ROOT).trim();
        Matcher matcher = WORD_PATTERN.matcher(text);
        List<String> words = new ArrayList<>();
        while (matcher.find()) {
            words.add(matcher.group());
        }
        List<String> tokens = new ArrayList<>();
        tokens.add(clsToken);
        for (String word : words) {
            tokens.addAll(tokenizeWord(word));
        }
        tokens.add(sepToken);

        List<Integer> ids = new ArrayList<>(tokens.size());
        for (String t : tokens) {
            ids.add(vocab.getOrDefault(t, unkTokenId));
        }
        return ids;
    }

    public static class EncodedInputs {
        public final long[][] inputIds;
        public final long[][] attentionMask;
        public final long[][] tokenTypeIds;
        public final int realLength;

        public EncodedInputs(long[][] inputIds, long[][] attentionMask, long[][] tokenTypeIds, int realLength) {
            this.inputIds = inputIds;
            this.attentionMask = attentionMask;
            this.tokenTypeIds = tokenTypeIds;
            this.realLength = realLength;
        }
    }

    public EncodedInputs encode(String text, int maxLength) {
        List<Integer> tokenIds = tokenize(text);
        int realLen = Math.min(tokenIds.size(), maxLength);
        long[][] inputIds = new long[1][maxLength];
        long[][] attentionMask = new long[1][maxLength];
        long[][] tokenTypeIds = new long[1][maxLength];

        for (int i = 0; i < realLen; i++) {
            inputIds[0][i] = tokenIds.get(i);
            attentionMask[0][i] = 1L;
            tokenTypeIds[0][i] = 0L;
        }
        for (int i = realLen; i < maxLength; i++) {
            inputIds[0][i] = padTokenId;
            attentionMask[0][i] = 0L;
            tokenTypeIds[0][i] = 0L;
        }

        return new EncodedInputs(inputIds, attentionMask, tokenTypeIds, realLen);
    }
}
