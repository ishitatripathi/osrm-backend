@routing @bicycle @access
Feature: Bike - Access tags on nodes
# Reference: http://wiki.openstreetmap.org/wiki/Key:access

    Background:
        Given the profile "bicycle"

    Scenario: Bike - Access tag hierachy on nodes
        Then routability should be
            | node/access | node/vehicle | node/bicycle | node/highway  | bothw |
            |             |              |              |               | x     |
            | yes         |              |              |               | x     |
            | no          |              |              |               |       |
            |             | yes          |              |               | x     |
            |             | no           |              |               |       |
            | no          | yes          |              |               | x     |
            | yes         | no           |              |               |       |
            |             |              | yes          |               | x     |
            |             |              | no           |               |       |
            |             |              | no           | crossing      | x     |
            | no          |              | yes          |               | x     |
            | yes         |              | no           |               |       |
            |             | no           | yes          |               | x     |
            |             | yes          | no           |               |       |
