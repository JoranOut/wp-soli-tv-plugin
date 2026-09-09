<?php

namespace Soli\TV;

class TVMessageTableHandler {
  private $charset;
  private $wpdb;

  private $tv_message_table;

  function __construct() {
    global $wpdb;
    $this->wpdb = $wpdb;
    $this->charset = $wpdb->get_charset_collate();
    $this->tv_message_table = $wpdb->prefix . "tv_message";
  }

  function createTVMessageTable() {
    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
    dbDelta("CREATE TABLE $this->tv_message_table (
        id BIGINT(20) unsigned NOT NULL AUTO_INCREMENT,
        title TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'img_text',
        content LONGTEXT NOT NULL,
        start_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status varchar(20) NOT NULL DEFAULT 'PLANNED',
        img BIGINT(20),
        link TEXT,
        PRIMARY KEY  (id)
    ) $this->charset;");
  }

  function dropTVMessageTable() {
    global $wpdb;
    $sql = "DROP TABLE IF EXISTS $this->tv_message_table";
    $wpdb->query($sql);
  }

  function getSingleTVMessage($message_id) {
      if (empty($message_id)) {
          return null;
      }
      return $this->loadTVMessagesById($message_id);
  }

  /**
   * One message by id, or null when there is no such row.
   *
   * Returns a single row rather than a list: the route this backs is
   * `/message/{id}`, and handing back a one-element array made every caller
   * unwrap it. `get_row()` also answers null for a miss, which is what the
   * endpoint's 204 branch tests.
   */
  function loadTVMessagesById($message_id) {
      $query = $this->wpdb->prepare("
              SELECT m.*
              FROM $this->tv_message_table m
              WHERE m.id = %d", $message_id);
      return $this->wpdb->get_row($query, ARRAY_A);
  }

  function getTVMessages() {
    return $this->loadCurrentTVMessages();
  }

  /**
   * Messages whose active window covers this moment.
   *
   * Bounds are compared against `current_time('mysql')` - site-local, matching
   * how the editor sends them - and not against MySQL's `current_date`, which
   * is midnight today: a message starting later today used to stay off the
   * screen until the next day, and one ending today lingered all day. The
   * start bound is inclusive so a window may legitimately open right now.
   *
   * The placeholders also matter: `wpdb::prepare()` calls `_doing_it_wrong()`
   * when handed a query with no placeholder at all, so the previous version
   * emitted a notice on every poll from the TV.
   */
  function loadCurrentTVMessages() {
    $now = current_time('mysql');
    $query = $this->wpdb->prepare("
                SELECT m.*
                FROM $this->tv_message_table m
                WHERE m.start_date <= %s AND m.end_date >= %s", $now, $now);
    return $this->wpdb->get_results($query, ARRAY_A);
  }

  function persistMessage($id, $message) {
    return $this->saveTVMessage((object)[
      "id" => $id,
      "title" => $message->title,
      "type" => $message->type,
      "content" => $message->content,
      "start_date" => $message->start_date,
      "end_date" => $message->end_date,
      "status" => $message->status,
      "img" => $message->img ?: NULL,
      "link" => $message->link ?: NULL
    ]);
  }

  /**
   * Insert or update one message.
   *
   * Uses `wpdb::insert()`/`wpdb::update()` rather than hand-built SQL because
   * of `img`: it is a nullable BIGINT, and `wpdb::prepare()` renders a PHP null
   * bound to `%s` as an empty string, so "no image" was stored as `0` - and
   * would abort the write outright under strict SQL mode. These two methods
   * emit a real `NULL` for a null value and take an explicit format per column,
   * so `img` is finally written as the integer it is declared to be.
   */
  function saveTVMessage($message) {
    $data = array(
      'title'      => $message->title,
      'type'       => $message->type,
      'content'    => $message->content,
      'start_date' => $message->start_date,
      'end_date'   => $message->end_date,
      'status'     => $message->status,
      'img'        => isset($message->img) ? (int) $message->img : null,
      'link'       => $message->link,
    );

    // Order matches $data. %d for the attachment id, %s for the rest; a null
    // value ignores its format and is written as NULL either way.
    $formats = array('%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s');

    if (empty($message->id) || $message->id === -1) {
      $written = $this->wpdb->insert($this->tv_message_table, $data, $formats);
      if (false === $written) {
        return null;
      }
      $message->id = $this->wpdb->insert_id;
    } else {
      $written = $this->wpdb->update(
        $this->tv_message_table,
        $data,
        array('id' => $message->id),
        $formats,
        array('%d')
      );
      if (false === $written) {
        return null;
      }
    }

    return $message;
  }
}

