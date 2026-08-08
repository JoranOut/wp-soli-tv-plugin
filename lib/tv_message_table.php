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

  function dropLocationTable() {
    global $wpdb;
    $sql = "DROP TABLE IF EXISTS $this->tv_message_table";
    $wpdb->query($sql);
  }

  function getSingleTVMessage($message_id) {
      if (empty($message_id)) {
          return null;
      }
      $this->loadTVMessagesById($message_id);
  }

  function loadTVMessagesById($message_id) {
      $query = $this->wpdb->prepare("
              SELECT m.* 
              FROM $this->tv_message_table m
              WHERE m.id = %d", $message_id);
      return $this->wpdb->get_results($query, ARRAY_A);
  }

  function getTVMessages() {
    return $this->loadCurrentTVMessages();
  }

  function loadCurrentTVMessages() {
    $query = $this->wpdb->prepare("
                SELECT m.*
                FROM $this->tv_message_table m
                WHERE m.start_date < current_date and m.end_date >= current_date");
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

  function saveTVMessage($message) {
    if (empty($message->id)|| $message->id === -1) {
      $query = $this->wpdb->prepare("
                        INSERT INTO $this->tv_message_table 
                            (title, type, content, start_date, end_date, status, img, link)
                        VALUES
                            (%s, %s, %s, %s, %s, %s, %s, %s)",
          $message->title,
          $message->type,
          $message->content,
          $message->start_date,
          $message->end_date,
          $message->status,
          $message->img,
          $message->link
      );

      $this->wpdb->get_results($query, ARRAY_A);
      $message->id = $this->wpdb->insert_id;
    } else {
      $query = $this->wpdb->prepare("
                        UPDATE $this->tv_message_table 
                        SET title = %s,
                            type = %s,
                            content = %s,
                            start_date = %s,
                            end_date = %s,
                            status = %s,
                            img = %s,
                            link = %s
                        WHERE id=%d;",
          $message->title,
          $message->type,
          $message->content,
          $message->start_date,
          $message->end_date,
          $message->status,
          $message->img,
          $message->link,
          $message->id
      );

      $this->wpdb->get_results($query, ARRAY_A);
    }
    return $message;
  }
}

