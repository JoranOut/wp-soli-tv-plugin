<?php

/**
 * Accepted values for a message's `status`.
 *
 * `PLANNED` is in the list because it is the column default in
 * `TVMessageTableHandler::createTVMessageTable()`. Without it a row created by
 * anything other than this endpoint - a direct insert, a seeded fixture - could
 * be read back over GET but never saved again, because the validation below
 * rejected the very status the schema had just assigned it.
 */
const SOLI_TV_MESSAGE_STATUSES = array('PLANNED', 'draft', 'published', 'archived');

add_action('rest_api_init', 'soli_tv_api', 10, 1);
function soli_tv_api() {
  buildGETCurrentTVMessages();
  buildGETSingleTVMessage();
  buildPOSTPersistTVMessage();
}

function buildGETCurrentTVMessages() {
    register_rest_route('soli_tv/v1', '/messages', array(
        'methods' => 'GET',
        'permission_callback' => '__return_true', // *always set a permission callback
        'callback' => function ($request) {
            $tvMessageHandler = new \Soli\TV\TVMessageTableHandler();
            $messages = $tvMessageHandler->getTVMessages();
            $response = new WP_REST_Response($messages);
            if (!$messages) {
                $response->set_status(204);
            } else {
                $response->set_status(200);
            }
            return $response;
        },
    ));
}

function buildGETSingleTVMessage(){
    register_rest_route('soli_tv/v1', '/message/(?P<id>\d+)', array(
        'methods' => 'GET',
        'permission_callback' => '__return_true', // *always set a permission callback
        'callback' => function ($request) {
            $tvMessageHandler = new \Soli\TV\TVMessageTableHandler();
            $message = $tvMessageHandler->getSingleTVMessage($request['id']);
            $response = new WP_REST_Response($message);
            if (!$message) {
                $response->set_status(204);
            } else {
                $response->set_status(200);
            }
            return $response;
        },
    ));
}

function buildPOSTPersistTVMessage() {
  register_rest_route('soli_tv/v1', '/message(?:/(?P<id>\d+))?', array(
    'methods' => 'POST',
    'permission_callback' => function () {
      return current_user_can('edit_posts');
    }, // *always set a permission callback
    'callback' => function ($request) {
      $tvMessageHandler = new \Soli\TV\TVMessageTableHandler();
      $body = json_decode($request->get_body());

      if (!isset($body->title)
            || !isset($body->content)
            || !isset($body->type)
            || !isset($body->start_date)
            || !isset($body->end_date)
            || !isset($body->status)
            || !in_array($body->status, SOLI_TV_MESSAGE_STATUSES, true)
      ) {
        // `WP_REST_Server::INVALID_ARGUMENT` does not exist - the class only
        // defines READABLE, CREATABLE, EDITABLE, DELETABLE and ALLMETHODS - so
        // reaching this branch raised a fatal "undefined constant" error under
        // PHP 8 instead of answering 400. A WP_Error carries the string code
        // WordPress itself uses for this case and renders as a normal REST
        // error body.
        return new WP_Error(
          'rest_invalid_param',
          __('Invalid request arguments.', 'soli-tv'),
          array('status' => 400)
        );
      }

      $message = $tvMessageHandler->persistMessage($request['id'], $body);
      $response = new WP_REST_Response($message);
      if (!$message) {
        $response->set_status(204);
      } else {
        $response->set_status(200);
      }
      return $response;
    },
  ));
}
