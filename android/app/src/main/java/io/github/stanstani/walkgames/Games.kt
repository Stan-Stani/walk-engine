package io.github.stanstani.walkgames

/** The published walk games (GitHub Pages). 소리 엽서 joins once it is public; 도감 여행 is tabled. */
data class Game(val slug: String, val title: String, val blurb: String) {
    val url get() = "$SITE/$slug/"
}

const val SITE_HOST = "stan-stani.github.io"
const val SITE = "https://$SITE_HOST"

val GAMES = listOf(
    Game("jeomsim-bangsong", "점심 방송", "A transfer student, the broadcast club and the lunchtime show"),
    Game("seongsilho", "성실호", "Following Peter F. Hamilton's Exodus"),
    Game("hyeongje", "형제", "Following Adrian Tchaikovsky's The Expert System's Brother"),
    Game("daneo-maul", "단어 마을", "A tiny vocabulary village"),
    Game("kotoba-mura", "ことばのむら", "A tiny Japanese village for beginners"),
)

fun gameOf(slug: String?) = GAMES.firstOrNull { it.slug == slug }
