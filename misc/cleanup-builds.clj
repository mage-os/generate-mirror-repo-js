(require
  '[clojure.string :as s])

(defn list-packages [dir]
  (let [files (file-seq (clojure.java.io/file dir))]
    (->> files
         (filter #(.isFile %))
         (map str)
         (filter #(s/ends-with? % ".zip")))))

(defn package-base-name [package-file]
  (first (s/split package-file #"-[0-9.]+-a[^-]+$")))

(defn last-modified [file]
  (let [file (if (string? file) (clojure.java.io/file file) file)]
    (.lastModified file)))

(defn sort-files-asc [files]
  (sort #(compare (last-modified %1) (last-modified %2)) files))

(defn to-delete [n-to-keep packages]
  (->> (group-by package-base-name packages)
       (vals)
       (map sort-files-asc) ;; oldest first
       (map #(take (max (- (count %) n-to-keep) 0) %))))

(let [[dir n] *command-line-args*]
  (if (empty? dir)
    (println "Usage: <packages-dir> [<n-to-keep>]")
    (let [n-to-keep (if (empty? n) 7 (Integer/parseInt n))
          packages (list-packages dir)]
      (->> packages
           (to-delete n-to-keep)
           (flatten)
           (map clojure.java.io/file)
           (map (fn [file] (.delete file) file))
           vec))))
